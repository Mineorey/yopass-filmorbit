package server

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"go.uber.org/zap/zaptest"
)

const accessTestSecretBody = `{"message":"` + pgpTestMessage + `","expiration":3600,"one_time":true}`

// newAccessServer returns a Server with the given shared access password and
// its full HTTP handler, so routing and middleware are exercised end-to-end.
func newAccessServer(t *testing.T, password string) (*Server, http.Handler) {
	t.Helper()
	db := newTestDB()
	srv := &Server{
		DB:             db,
		FileStore:      NewDatabaseFileStore(db),
		MaxLength:      10000,
		MaxFileSize:    1024 * 1024,
		Registry:       prometheus.NewRegistry(),
		Logger:         zaptest.NewLogger(t),
		AccessPassword: password,
	}
	return srv, srv.HTTPHandler()
}

func postCreateSecret(h http.Handler, cookies ...*http.Cookie) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, "/create/secret", strings.NewReader(accessTestSecretBody))
	for _, c := range cookies {
		req.AddCookie(c)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func postAccess(h http.Handler, password string, mutate func(*http.Request)) *httptest.ResponseRecorder {
	body, _ := json.Marshal(map[string]string{"password": password})
	req := httptest.NewRequest(http.MethodPost, "/access", strings.NewReader(string(body)))
	req.Header.Set("Content-Type", "application/json")
	if mutate != nil {
		mutate(req)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func accessCookie(rec *httptest.ResponseRecorder) *http.Cookie {
	for _, c := range rec.Result().Cookies() {
		if c.Name == "yopass_access" {
			return c
		}
	}
	return nil
}

func responseMessage(t *testing.T, rec *httptest.ResponseRecorder) string {
	t.Helper()
	var body map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("invalid JSON body %q: %v", rec.Body.String(), err)
	}
	return body["message"]
}

func TestAccessDisabledLeavesCreateOpen(t *testing.T) {
	_, h := newAccessServer(t, "")
	if rec := postCreateSecret(h); rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestAccessRequiredBlocksCreateSecret(t *testing.T) {
	_, h := newAccessServer(t, "kunde2026")
	rec := postCreateSecret(h)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d: %s", rec.Code, rec.Body.String())
	}
	if msg := responseMessage(t, rec); msg != "access password required" {
		t.Errorf("message = %q, want %q", msg, "access password required")
	}
}

func TestAccessRequiredBlocksCreateFile(t *testing.T) {
	_, h := newAccessServer(t, "kunde2026")
	req := httptest.NewRequest(http.MethodPost, "/create/file", strings.NewReader("data"))
	req.Header.Set("Content-Type", "application/octet-stream")
	req.Header.Set("X-Yopass-Expiration", "3600")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d: %s", rec.Code, rec.Body.String())
	}
	if msg := responseMessage(t, rec); msg != "access password required" {
		t.Errorf("message = %q, want %q", msg, "access password required")
	}
}

func TestAccessLoginWrongPassword(t *testing.T) {
	_, h := newAccessServer(t, "kunde2026")
	rec := postAccess(h, "falsch", nil)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d: %s", rec.Code, rec.Body.String())
	}
	if got := rec.Header().Get("WWW-Authenticate"); got != "" {
		t.Errorf("WWW-Authenticate must be absent, got %q", got)
	}
	if got := rec.Header().Get("Set-Cookie"); got != "" {
		t.Errorf("no cookie expected, got %q", got)
	}
	if msg := responseMessage(t, rec); msg != "invalid access password" {
		t.Errorf("message = %q, want %q", msg, "invalid access password")
	}
}

func TestAccessLoginTrimsWhitespace(t *testing.T) {
	_, h := newAccessServer(t, "kunde2026")
	if rec := postAccess(h, "  kunde2026\n", nil); rec.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestAccessLoginSetsCookie(t *testing.T) {
	_, h := newAccessServer(t, "kunde2026")
	rec := postAccess(h, "kunde2026", nil)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d: %s", rec.Code, rec.Body.String())
	}
	c := accessCookie(rec)
	if c == nil {
		t.Fatal("yopass_access cookie not set")
	}
	if !c.HttpOnly {
		t.Error("cookie must be HttpOnly")
	}
	if c.SameSite != http.SameSiteLaxMode {
		t.Errorf("SameSite = %v, want Lax", c.SameSite)
	}
	if c.Path != "/" {
		t.Errorf("Path = %q, want /", c.Path)
	}
	if c.MaxAge != 30*24*3600 {
		t.Errorf("MaxAge = %d, want %d", c.MaxAge, 30*24*3600)
	}
	if rec := postCreateSecret(h, c); rec.Code != http.StatusOK {
		t.Fatalf("create with cookie: expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestAccessCookieSecureBehindTrustedProxy(t *testing.T) {
	srv, h := newAccessServer(t, "kunde2026")
	srv.TrustedProxies = []string{"10.0.0.1"}

	rec := postAccess(h, "kunde2026", func(r *http.Request) {
		r.RemoteAddr = "10.0.0.1:4711"
		r.Header.Set("X-Forwarded-Proto", "https")
	})
	if c := accessCookie(rec); c == nil || !c.Secure {
		t.Fatalf("expected Secure cookie behind trusted proxy, got %+v", c)
	}

	rec = postAccess(h, "kunde2026", func(r *http.Request) {
		r.RemoteAddr = "10.0.0.1:4711"
	})
	if c := accessCookie(rec); c == nil || c.Secure {
		t.Fatalf("expected non-Secure cookie over plain HTTP, got %+v", c)
	}

	// An untrusted client cannot claim HTTPS.
	rec = postAccess(h, "kunde2026", func(r *http.Request) {
		r.RemoteAddr = "192.0.2.7:4711"
		r.Header.Set("X-Forwarded-Proto", "https")
	})
	if c := accessCookie(rec); c == nil || c.Secure {
		t.Fatalf("expected non-Secure cookie for forged header, got %+v", c)
	}

	srv.PublicURL = "https://safe.example.com"
	rec = postAccess(h, "kunde2026", nil)
	if c := accessCookie(rec); c == nil || !c.Secure {
		t.Fatalf("expected Secure cookie with https public URL, got %+v", c)
	}
}

func TestAccessCookieInvalidAfterPasswordChange(t *testing.T) {
	_, hA := newAccessServer(t, "passwortA")
	c := accessCookie(postAccess(hA, "passwortA", nil))
	if c == nil {
		t.Fatal("no cookie from server A")
	}
	_, hB := newAccessServer(t, "passwortB")
	if rec := postCreateSecret(hB, c); rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 on server B, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestAccessCookieExpired(t *testing.T) {
	const password = "kunde2026"
	_, h := newAccessServer(t, password)

	keyMac := hmac.New(sha256.New, []byte("filmorbit-access-v1"))
	keyMac.Write([]byte(password))
	signingKey := keyMac.Sum(nil)
	expiry := strconv.FormatInt(time.Now().Add(-time.Minute).Unix(), 10)
	mac := hmac.New(sha256.New, signingKey)
	mac.Write([]byte(expiry))
	c := &http.Cookie{Name: "yopass_access", Value: expiry + "." + hex.EncodeToString(mac.Sum(nil))}

	if rec := postCreateSecret(h, c); rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for expired cookie, got %d: %s", rec.Code, rec.Body.String())
	}

	// Sanity check: the same construction with a future expiry is accepted,
	// so the 401 above is caused by the expiry and not by a format mismatch.
	expiry = strconv.FormatInt(time.Now().Add(time.Hour).Unix(), 10)
	mac = hmac.New(sha256.New, signingKey)
	mac.Write([]byte(expiry))
	c = &http.Cookie{Name: "yopass_access", Value: expiry + "." + hex.EncodeToString(mac.Sum(nil))}
	if rec := postCreateSecret(h, c); rec.Code != http.StatusOK {
		t.Fatalf("expected 200 for valid cookie, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestAccessRateLimitPerClientIP(t *testing.T) {
	srv, h := newAccessServer(t, "kunde2026")
	srv.TrustedProxies = []string{"10.0.0.1"}
	from := func(ip string) func(*http.Request) {
		return func(r *http.Request) {
			r.RemoteAddr = "10.0.0.1:4711"
			r.Header.Set("X-Forwarded-For", ip)
		}
	}

	for i := 0; i < 10; i++ {
		if rec := postAccess(h, "falsch", from("203.0.113.1")); rec.Code != http.StatusUnauthorized {
			t.Fatalf("attempt %d: expected 401, got %d", i+1, rec.Code)
		}
	}
	rec := postAccess(h, "kunde2026", from("203.0.113.1"))
	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("11th attempt: expected 429, got %d: %s", rec.Code, rec.Body.String())
	}
	if accessCookie(rec) != nil {
		t.Error("rate-limited request must not set a cookie")
	}
	if rec := postAccess(h, "kunde2026", from("203.0.113.2")); rec.Code != http.StatusNoContent {
		t.Fatalf("other IP: expected 204, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestAccessGetSecretStaysOpen(t *testing.T) {
	_, h := newAccessServer(t, "kunde2026")
	req := httptest.NewRequest(http.MethodGet, "/secret/8f2d1c4e-1b2a-4c3d-9e8f-0a1b2c3d4e5f", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code == http.StatusUnauthorized {
		t.Fatalf("GET /secret must not require the access password, got 401: %s", rec.Body.String())
	}
}

func TestAccessStatusEndpoint(t *testing.T) {
	_, h := newAccessServer(t, "kunde2026")
	status := func(cookies ...*http.Cookie) bool {
		t.Helper()
		req := httptest.NewRequest(http.MethodGet, "/access", nil)
		for _, c := range cookies {
			req.AddCookie(c)
		}
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("GET /access: expected 200, got %d: %s", rec.Code, rec.Body.String())
		}
		var body map[string]interface{}
		if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
			t.Fatalf("invalid JSON %q: %v", rec.Body.String(), err)
		}
		granted, ok := body["granted"].(bool)
		if !ok {
			t.Fatalf("granted missing or not bool: %v", body)
		}
		return granted
	}

	if status() {
		t.Error("granted without cookie")
	}
	c := accessCookie(postAccess(h, "kunde2026", nil))
	if c == nil {
		t.Fatal("no cookie")
	}
	if !status(c) {
		t.Error("not granted with valid cookie")
	}
}

func TestConfigReportsAccessRequired(t *testing.T) {
	for _, tc := range []struct {
		password string
		want     bool
	}{{"kunde2026", true}, {"", false}} {
		_, h := newAccessServer(t, tc.password)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/config", nil))
		var cfg map[string]interface{}
		if err := json.Unmarshal(rec.Body.Bytes(), &cfg); err != nil {
			t.Fatal(err)
		}
		if got, ok := cfg["ACCESS_PASSWORD_REQUIRED"].(bool); !ok || got != tc.want {
			t.Errorf("password %q: ACCESS_PASSWORD_REQUIRED = %v, want %v", tc.password, cfg["ACCESS_PASSWORD_REQUIRED"], tc.want)
		}
	}
}

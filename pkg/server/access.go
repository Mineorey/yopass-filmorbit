package server

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Shared access password (--access-password): visitors must enter one common
// password before they may create secrets or upload files. Opening secret
// links stays open. A successful login sets a signed, expiring cookie; the
// signature is derived from the password, so changing it invalidates every
// issued cookie.

const (
	accessCookieName      = "yopass_access"
	accessCookieLifetime  = 30 * 24 * time.Hour
	accessKeyDerivation   = "filmorbit-access-v1"
	accessMaxFailures     = 10
	accessFailureWindow   = 10 * time.Minute
	accessMaxBodyBytes    = 4096
	accessLimiterSweepLen = 10000
)

// accessLimiter counts failed access-password attempts per client IP.
type accessLimiter struct {
	mu       sync.Mutex
	failures map[string][]time.Time
}

func newAccessLimiter() *accessLimiter {
	return &accessLimiter{failures: make(map[string][]time.Time)}
}

// recent drops failures older than the window for ip and returns the rest.
// Callers must hold l.mu.
func (l *accessLimiter) recent(ip string, now time.Time) []time.Time {
	kept := l.failures[ip][:0]
	for _, t := range l.failures[ip] {
		if now.Sub(t) < accessFailureWindow {
			kept = append(kept, t)
		}
	}
	if len(kept) == 0 {
		delete(l.failures, ip)
		return nil
	}
	l.failures[ip] = kept
	return kept
}

func (l *accessLimiter) blocked(ip string, now time.Time) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	return len(l.recent(ip, now)) >= accessMaxFailures
}

func (l *accessLimiter) recordFailure(ip string, now time.Time) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if len(l.failures) >= accessLimiterSweepLen {
		for other := range l.failures {
			l.recent(other, now)
		}
	}
	l.failures[ip] = append(l.recent(ip, now), now)
}

// accessPassword returns the configured password without surrounding
// whitespace, which commonly sneaks in through env files.
func (y *Server) accessPassword() string {
	return strings.TrimSpace(y.AccessPassword)
}

// accessEnabled reports whether a shared access password is configured.
func (y *Server) accessEnabled() bool {
	return y.accessPassword() != ""
}

func (y *Server) accessSigningKey() []byte {
	mac := hmac.New(sha256.New, []byte(accessKeyDerivation))
	mac.Write([]byte(y.accessPassword()))
	return mac.Sum(nil)
}

func (y *Server) accessSignature(expiry string) string {
	mac := hmac.New(sha256.New, y.accessSigningKey())
	mac.Write([]byte(expiry))
	return hex.EncodeToString(mac.Sum(nil))
}

// accessGranted reports whether r carries a validly signed, unexpired
// access cookie.
func (y *Server) accessGranted(r *http.Request) bool {
	c, err := r.Cookie(accessCookieName)
	if err != nil {
		return false
	}
	expiry, sig, ok := strings.Cut(c.Value, ".")
	if !ok {
		return false
	}
	if !hmac.Equal([]byte(sig), []byte(y.accessSignature(expiry))) {
		return false
	}
	unix, err := strconv.ParseInt(expiry, 10, 64)
	return err == nil && unix > time.Now().Unix()
}

// accessCookieSecure reports whether the access cookie should carry the
// Secure attribute: direct TLS, X-Forwarded-Proto: https from a trusted
// proxy, or an https public URL (the server often only sees plain HTTP
// behind a proxy).
func (y *Server) accessCookieSecure(r *http.Request) bool {
	if r.TLS != nil || strings.HasPrefix(strings.ToLower(y.PublicURL), "https://") {
		return true
	}
	if r.Header.Get("X-Forwarded-Proto") != "https" {
		return false
	}
	remoteIP, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		remoteIP = r.RemoteAddr
	}
	return y.isTrustedProxy(remoteIP)
}

// requireAccess rejects requests without a valid access cookie. It is a
// no-op when no access password is configured.
func (y *Server) requireAccess(next http.Handler) http.Handler {
	if !y.accessEnabled() {
		return next
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !y.accessGranted(r) {
			jsonError(w, http.StatusUnauthorized, "access password required")
			return
		}
		next.ServeHTTP(w, r)
	})
}

// accessLoginHandler handles POST /access with {"password": "..."}.
func (y *Server) accessLoginHandler(w http.ResponseWriter, r *http.Request) {
	ip := y.getRealClientIP(r)
	now := time.Now()
	if y.accessAttempts.blocked(ip, now) {
		jsonError(w, http.StatusTooManyRequests, "too many attempts, try again later")
		return
	}

	var body struct {
		Password string `json:"password"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, accessMaxBodyBytes)).Decode(&body); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	got := sha256.Sum256([]byte(strings.TrimSpace(body.Password)))
	want := sha256.Sum256([]byte(y.accessPassword()))
	if subtle.ConstantTimeCompare(got[:], want[:]) != 1 {
		y.accessAttempts.recordFailure(ip, now)
		jsonError(w, http.StatusUnauthorized, "invalid access password")
		return
	}

	expiry := strconv.FormatInt(now.Add(accessCookieLifetime).Unix(), 10)
	http.SetCookie(w, &http.Cookie{
		Name:     accessCookieName,
		Value:    expiry + "." + y.accessSignature(expiry),
		Path:     "/",
		MaxAge:   int(accessCookieLifetime / time.Second),
		HttpOnly: true,
		Secure:   y.accessCookieSecure(r),
		SameSite: http.SameSiteLaxMode,
	})
	w.WriteHeader(http.StatusNoContent)
}

// accessStatusHandler handles GET /access and reports {"granted": bool}.
func (y *Server) accessStatusHandler(w http.ResponseWriter, r *http.Request) {
	y.writeJSON(w, http.StatusOK, map[string]bool{"granted": y.accessGranted(r)})
}

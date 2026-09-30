package service

import (
	"strings"
	"time"
)

var JakartaLocation = func() *time.Location {
	loc, err := time.LoadLocation("Asia/Jakarta")
	if err != nil {
		return time.FixedZone("Asia/Jakarta", 7*3600)
	}
	return loc
}()

// ParseJakartaDateRange parses named periods (today, this_week, this_month, hari_ini, minggu_ini, bulan_ini)
// or start/end dates in Asia/Jakarta timezone.
func ParseJakartaDateRange(period, startStr, endStr string, refTime time.Time) (*time.Time, *time.Time, error) {
	if refTime.IsZero() {
		refTime = time.Now().In(JakartaLocation)
	} else {
		refTime = refTime.In(JakartaLocation)
	}

	normPeriod := strings.ToLower(strings.TrimSpace(period))
	switch normPeriod {
	case "today", "hari_ini", "hari-ini":
		y, m, d := refTime.Date()
		start := time.Date(y, m, d, 0, 0, 0, 0, JakartaLocation)
		end := time.Date(y, m, d, 23, 59, 59, 999999999, JakartaLocation)
		return &start, &end, nil

	case "this_week", "this-week", "minggu_ini", "minggu-ini", "week":
		y, m, d := refTime.Date()
		weekday := int(refTime.Weekday())
		// Monday is day 0 in ISO week (Sunday is 0 in Go, so adjust Sunday to 6)
		offset := (weekday + 6) % 7
		start := time.Date(y, m, d-offset, 0, 0, 0, 0, JakartaLocation)
		end := start.AddDate(0, 0, 6).Add(24*time.Hour - time.Nanosecond)
		return &start, &end, nil

	case "this_month", "this-month", "bulan_ini", "bulan-ini", "month":
		y, m, _ := refTime.Date()
		start := time.Date(y, m, 1, 0, 0, 0, 0, JakartaLocation)
		end := start.AddDate(0, 1, 0).Add(-time.Nanosecond)
		return &start, &end, nil
	}

	var startDate, endDate *time.Time
	if startStr != "" {
		if t, err := time.Parse(time.RFC3339, startStr); err == nil {
			startDate = &t
		} else if t, err := time.ParseInLocation("2006-01-02", startStr, JakartaLocation); err == nil {
			start := time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, JakartaLocation)
			startDate = &start
		}
	}

	if endStr != "" {
		if t, err := time.Parse(time.RFC3339, endStr); err == nil {
			endDate = &t
		} else if t, err := time.ParseInLocation("2006-01-02", endStr, JakartaLocation); err == nil {
			end := time.Date(t.Year(), t.Month(), t.Day(), 23, 59, 59, 999999999, JakartaLocation)
			endDate = &end
		}
	}

	return startDate, endDate, nil
}

// IsValidCorrectionReason validates whether the given reason complies with PRD F3:
// Fast options: "salah harga", "batal", "salah dompet", "lainnya" (with text).
func IsValidCorrectionReason(reason string) bool {
	trimmed := strings.TrimSpace(strings.ToLower(reason))
	if trimmed == "" {
		return false
	}
	validOptions := []string{
		"salah harga", "salah_harga",
		"batal",
		"salah dompet", "salah_dompet",
		"lainnya", "other",
		"pindah wallet", "pindah dompet",
		"salah input",
	}
	for _, opt := range validOptions {
		if strings.HasPrefix(trimmed, opt) || strings.Contains(trimmed, opt) {
			return true
		}
	}
	return len(trimmed) >= 3
}

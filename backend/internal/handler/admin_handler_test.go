package handler

import (
	"math"
	"net/http/httptest"
	"strconv"
	"testing"

	"github.com/gin-gonic/gin"
)

func paginationContext(query string) *gin.Context {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest("GET", "/?"+query, nil)
	return c
}

func TestParsePagination(t *testing.T) {
	tests := []struct {
		name, query   string
		limit, offset int
	}{
		{"defaults", "", 50, 0},
		{"invalid", "limit=nope&offset=nope", 50, 0},
		{"zero", "limit=0&offset=0", 50, 0},
		{"negative", "limit=-2&offset=-4", 50, 0},
		{"cap", "limit=500&offset=9", 200, 9},
		{"offset exact max", "offset=" + strconv.Itoa(maxPaginationOffset), 50, maxPaginationOffset},
		{"offset max plus one", "offset=" + strconv.Itoa(maxPaginationOffset+1), 50, maxPaginationOffset},
		{"offset max int", "offset=" + strconv.Itoa(math.MaxInt), 50, maxPaginationOffset},
		{"offset overflow", "offset=99999999999999999999999999", 50, 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			limit, offset := parsePagination(paginationContext(tt.query), 50, 200)
			if limit != tt.limit || offset != tt.offset {
				t.Fatalf("got (%d,%d), want (%d,%d)", limit, offset, tt.limit, tt.offset)
			}
		})
	}
}

func TestParseAdminFilterPagination(t *testing.T) {
	h := &AdminHandler{}
	cases := []struct {
		query         string
		limit, offset int
	}{
		{"limit=bad&page=3", 50, 100},
		{"limit=0&page=2", 50, 50},
		{"limit=-1&page=1", 50, 0},
		{"", 50, 0},
		{"limit=500&page=2", 200, 200},
		{"limit=1&page=2", 1, 1},
		{"limit=200&page=2", 200, 200},
		{"limit=201&page=2", 200, 200},
		{"page=bad", 50, 0},
		{"page=0", 50, 0},
		{"page=-2", 50, 0},
		{"page=" + strconv.Itoa(maxPaginationOffset/50+1) + "&limit=50", 50, maxPaginationOffset},
		{"page=" + strconv.Itoa(maxPaginationOffset/50+2) + "&limit=50", 50, maxPaginationOffset},
		{"page=" + strconv.Itoa(maxPaginationOffset/3+1) + "&limit=3", 3, (maxPaginationOffset / 3) * 3},
		{"page=" + strconv.Itoa(maxPaginationOffset/3+2) + "&limit=3", 3, maxPaginationOffset},
		{"page=" + strconv.Itoa(math.MaxInt) + "&limit=50", 50, maxPaginationOffset},
		{"page=99999999999999999999999999&limit=50", 50, 0},
		{"limit=10&page=9&offset=17", 10, 17},
		{"limit=10&page=9&offset=-4", 10, 0},
		{"limit=10&page=9&offset=bad", 10, 0},
		{"page=9&offset=", 50, 0},
		{"page=2&offset=abc", 50, 0},
		{"page=2&offset=-5", 50, 0},
		{"offset=" + strconv.Itoa(maxPaginationOffset), 50, maxPaginationOffset},
		{"offset=" + strconv.Itoa(maxPaginationOffset+1), 50, maxPaginationOffset},
		{"offset=" + strconv.Itoa(math.MaxInt), 50, maxPaginationOffset},
		{"offset=99999999999999999999999999", 50, 0},
	}
	for _, tc := range cases {
		filter := h.parseAdminFilter(paginationContext(tc.query))
		if filter.Limit != tc.limit || filter.Offset != tc.offset {
			t.Errorf("%q: got (%d,%d), want (%d,%d)", tc.query, filter.Limit, filter.Offset, tc.limit, tc.offset)
		}
	}
}

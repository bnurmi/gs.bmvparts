#include <time.h>
#include <sys/time.h>
#define FAKE_NOW 1263555600L
time_t time(time_t *t) { if (t) *t = FAKE_NOW; return FAKE_NOW; }
int gettimeofday(struct timeval *tv, void *tz) {
  if (tv) { tv->tv_sec = FAKE_NOW; tv->tv_usec = 0; }
  return 0;
}
int clock_gettime(int clk_id, struct timespec *ts) {
  if (ts) { ts->tv_sec = FAKE_NOW; ts->tv_nsec = 0; }
  return 0;
}

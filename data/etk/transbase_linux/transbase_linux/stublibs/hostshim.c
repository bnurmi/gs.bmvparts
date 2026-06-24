#include <string.h>
#include <unistd.h>
/* Common BMW/ESG-era hostnames the license might be bound to.
   Override env var FAKE_HOSTNAME to try a specific one. */
int gethostname(char *name, size_t len) {
  const char *h = "esgserv01";
  size_t n = strlen(h);
  if (len < n + 1) return -1;
  memcpy(name, h, n + 1);
  return 0;
}

/* Minimal libcrypt.so.1 stub. tbarc uses crypt() for password hashing.
   We accept any password since we only need read access. */
#include <string.h>
char *crypt(const char *key, const char *salt) {
  static char out[64];
  /* Return salt prefix + "x" so crypt() returns non-null without depending on glibc internals */
  if (!salt) return (char*)"";
  strncpy(out, salt, 60);
  out[60] = 'x'; out[61] = 0;
  return out;
}
char *crypt_r(const char *key, const char *salt, void *data) {
  return crypt(key, salt);
}
void encrypt(char *block, int edflag) { (void)block; (void)edflag; }
void setkey(const char *key) { (void)key; }

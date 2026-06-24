typedef void* WINDOW;
WINDOW *stdscr = (WINDOW*)1;
WINDOW *curscr = (WINDOW*)1;
WINDOW *initscr(void) { return (WINDOW*)1; }
int endwin(void) { return 0; }
int noecho(void) { return 0; }
int echo(void) { return 0; }
int raw(void) { return 0; }
int cbreak(void) { return 0; }
int wclear(WINDOW* w) { return 0; }
int wmove(WINDOW* w, int y, int x) { return 0; }
int wrefresh(WINDOW* w) { return 0; }
int wgetch(WINDOW* w) { return -1; }
int printw(const char* fmt, ...) { return 0; }
int wprintw(WINDOW* w, const char* fmt, ...) { return 0; }
int keypad(WINDOW* w, int b) { return 0; }
int scrollok(WINDOW* w, int b) { return 0; }
int idlok(WINDOW* w, int b) { return 0; }
int waddch(WINDOW* w, unsigned int c) { return 0; }
int waddstr(WINDOW* w, const char* s) { return 0; }
int wclrtoeol(WINDOW* w) { return 0; }
int wclrtobot(WINDOW* w) { return 0; }
int wattron(WINDOW* w, int a) { return 0; }
int wattroff(WINDOW* w, int a) { return 0; }
int werase(WINDOW* w) { return 0; }
WINDOW* newwin(int a, int b, int c, int d) { return (WINDOW*)1; }
int delwin(WINDOW* w) { return 0; }
int beep(void) { return 0; }
int LINES = 24;
int COLS = 80;
int nl(void) { return 0; }
int nonl(void) { return 0; }
int nocbreak(void) { return 0; }
int halfdelay(int t) { return 0; }
int intrflush(WINDOW* w, int b) { return 0; }
int wattr_on(WINDOW* w, int a, void* o) { return 0; }
int waddnstr(WINDOW* w, const char* s, int n) { return 0; }

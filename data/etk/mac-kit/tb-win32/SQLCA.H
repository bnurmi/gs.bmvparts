/************************************************ 

                      T r a n s B a s e / C D
  @(#) sqlca.h:   V6.1.2.19 (Build 404)
		Project: 4.119.1.19
		2004/08/05 11:46:57

  Copyright (c) 1995 - 
  Transaction Software GmbH
  D 81739 Munich 

 ***************************************************/

/* Module begin */
#ifndef _SQLCA_H
#define _SQLCA_H

#ifdef __cplusplus
extern "C"
{
#ifndef TBCONST
#define TBCONST const
#endif
#endif
#ifndef TBCONST
#define TBCONST
#endif


#pragma pack(1)



#undef tb_errtxt
#define _TB_ERRTXT

#define MAX_OPEN_CRS (10) /* max. number open cursors */

#define USE_TA (500) /* code of dynamic USE TA request */
#define USE_DB (501) /* code of dynamic USE DB request */

#define NO_INFO (0) /* no additional information
				   in sqlca.sqlerrd[0] */
#define COUNT_INFO (1) /* sqlca.sqlerrd[1] contains no. tried,
				sqlca.sqlerrd[2] contains no. ntuples */
#define NEW_DB_ID (2) /* new sqlca.dbid arrived */
#define NEW_TA_ID (3) /* new sqlca.taid arrived */

typedef struct
{
        long sqlcode;
        long sqlerrd[6];
        char sqlwarn0;
        char sqlwarn1;
        char sqlwarn2;
        char sqlwarn3;
        char sqlwarn4;
        char sqlwarn5;
        char sqlwarn6;
        char sqlwarn7;
    /* this part divides from X/OPEN standard */
        long errline; /* number of line, where error or
			       warning occured */
        char TBXFAR *errmodule; /* name of module where error or
			       warnig occured */
        char TBXFAR *tb_errtxt; /* error message from TransBase */
        Id taid; /* id of current transaction */
        State tastate; /* state of current transaction */
        Id dbid; /* id of current database */
        State dbstate; /* state of current database */
} Sqlca;

typedef struct
{
        char TBXFAR *crsname;/* name of cursor */
        Id taid; /* id of TA under which 
					   cursor was opened */
        Id dbid; /* id of DB on which 
					   cursor was opened */
        Query_descr qudescr; /* query description */
} Cursor;

        /* forward declarations */

#define sqlca (*sqlca_adr())



#pragma pack()


#if USE_PROTOTYPES == 1
typedef void (DLLEXPORT EsqlCallback)(char TBXFAR *);
typedef EsqlCallback *PEsqlCallback;
#include <stdarg.h>
Id _tb_dbid_crs(int);
Id _tb_dbname_to_id(char TBXFAR *);
Id _tb_get_stid(Id);
Id _tb_stmt_id(void);
Id _tb_taid_crs(int);
Query_descr TBXFAR *_tb_qudescr_addr_crs(int);
Sqlca TBXFAR *sqlca_adr(void);
char TBXFAR *_tb_malloc(size_t);
char TBXFAR *sqlca_give_errtxt(void);
int _tb_abortcallback(char TBXFAR *, long, PEsqlCallback);
int _tb_accept_db(char TBXFAR *, long, Id, char TBXFAR *);
int _tb_all_cls_crs(long);
int _tb_assign(void TBXFAR *, Attrtype TBXFAR *, short TBXFAR *, Query_descr TBXFAR *, int, int);
int _tb_ass_outhvr(Query_descr TBXFAR *, int, int, va_list TBXFAR *);
int _tb_begin_work(char TBXFAR *, long);
int _tb_cdelpos(char TBXFAR *, long, Cursor TBXFAR *, char TBXFAR *);
int _tb_ciud_src(char TBXFAR *, long, char TBXFAR *,
        PEsqlCallback, int, ...);
int _tb_cls_crs(Cursor TBXFAR * TBXFAR *);
int _tb_clscrs(char TBXFAR *, long, Cursor TBXFAR *TBXFAR *, char TBXFAR *);
int _tb_commit_work(char TBXFAR *, long);
int _tb_connect(char TBXFAR *);
int _tb_connect_db(char TBXFAR *, long, char TBXFAR *);
int _tb_consistency(char TBXFAR *, long, int);
int _tb_contact_db(char TBXFAR *, long, char TBXFAR *);
int _tb_copncrs(char TBXFAR *, long, Cursor TBXFAR *TBXFAR *, char TBXFAR *, char TBXFAR *, PEsqlCallback, int, ...);
int _tb_copn_si_crs(char TBXFAR *, long, long, long, Cursor TBXFAR *TBXFAR *, char TBXFAR *, char TBXFAR *, PEsqlCallback, int, ...);
int _tb_cseldec(char TBXFAR *, long, char TBXFAR *, PEsqlCallback, int, ...);
int _tb_cselrun(char TBXFAR *, long, char TBXFAR *, PEsqlCallback, int, ...);
int _tb_cupdpos(char TBXFAR *, long, Cursor TBXFAR *, char TBXFAR *, char TBXFAR *, PEsqlCallback, int, ...);
int _tb_datdir(char TBXFAR *, long, char TBXFAR *);
int _tb_ddl(char TBXFAR *, long, char TBXFAR *, PEsqlCallback, int, ...);
int _tb_disconnect(void);
int _tb_disconnect_db(char TBXFAR *, long);
int _tb_drop_all_stored(char TBXFAR *, long);
int _tb_dynamic(char TBXFAR *, long, char TBXFAR *, PEsqlCallback);
int _tb_fetchcrs(char TBXFAR *, long, Cursor TBXFAR *, char TBXFAR *, int, ...);
int _tb_fetch_si_crs(char TBXFAR *, long, Cursor TBXFAR *, char TBXFAR *, int, long, int, ...);
int _tb_find_crs(char TBXFAR *);
int _tb_login(char TBXFAR *, long, char TBXFAR *, char TBXFAR *);
int _tb_mini_parse(char TBXFAR *, char TBXFAR *TBXFAR *, char TBXFAR *TBXFAR *);
int _tb_mode(char TBXFAR *, long, char TBXFAR *, PEsqlCallback, int, ...);
int _tb_opn_crs(Cursor TBXFAR *TBXFAR *);
int _tb_pre_trace(int, ...);
int _tb_rollback_work(char TBXFAR *, long);
int _tb_sdelpos(char TBXFAR *, long, Id TBXFAR *, Cursor TBXFAR *, char TBXFAR *, char TBXFAR *);
int _tb_siud_src(char TBXFAR *, long, Id TBXFAR *, char TBXFAR *, PEsqlCallback, int, ...);
int _tb_sndevent(char TBXFAR *, long, char TBXFAR *, char TBXFAR *, char TBXFAR *);
int _tb_sndintr(char TBXFAR *, long);
int _tb_sopncrs(char TBXFAR *, long, Id TBXFAR *, Cursor TBXFAR *TBXFAR *, char TBXFAR *, char TBXFAR *, PEsqlCallback, int, ...);
int _tb_sopn_si_crs(char TBXFAR *, long, Id TBXFAR *, long, long, Cursor TBXFAR *TBXFAR *, char TBXFAR *, char TBXFAR *, PEsqlCallback, int, ...);
int _tb_sort(char TBXFAR *, long, char TBXFAR *, char TBXFAR *, int, int);
int _tb_spool(char TBXFAR *, long, char TBXFAR *, PEsqlCallback, int, ...);
int _tb_sseldec(char TBXFAR *, long, Id TBXFAR *, char TBXFAR *, PEsqlCallback, int, ...);
int _tb_sselrun(char TBXFAR *, long, Id TBXFAR *, char TBXFAR *, PEsqlCallback, int, ...);
int _tb_store_id(Id, Id);
int _tb_supdpos(char TBXFAR *, long, Id TBXFAR *, Cursor TBXFAR *, char TBXFAR *, char TBXFAR *, PEsqlCallback, int, ...);
int _tb_timeout(char TBXFAR *, long, long);
int _tb_use_db(char TBXFAR *, long, Id, char TBXFAR *);
int _tb_use_ta(char TBXFAR *, long, Id);
void _tb_free(char TBXFAR *);
void _tb_set_err(char TBXFAR *, long);
#else
typedef void (DLLEXPORT EsqlCallback)();
typedef EsqlCallback *PEsqlCallback;
Id _tb_dbid_crs();
Id _tb_dbname_to_id();
Id _tb_get_stid();
Id _tb_stmt_id();
Id _tb_taid_crs();
Query_descr *_tb_qudescr_addr_crs();
Sqlca *sqlca_adr();
char *_tb_malloc();
char *sqlca_give_errtxt();
int _tb_abortcallback();
int _tb_accept_db();
int _tb_all_cls_crs();
int _tb_assign();
int _tb_begin_work();
int _tb_cdelpos();
int _tb_ciud_src();
int _tb_cls_crs();
int _tb_clscrs();
int _tb_commit_work();
int _tb_connect();
int _tb_connect_db();
int _tb_consistency();
int _tb_contact_db();
int _tb_copncrs();
int _tb_copn_si_crs();
int _tb_cseldec();
int _tb_cselrun();
int _tb_cupdpos();
int _tb_datdir();
int _tb_ddl();
int _tb_disconnect();
int _tb_disconnect_db();
int _tb_drop_all_stored();
int _tb_dynamic();
int _tb_fetchcrs();
int _tb_fetch_si_crs();
int _tb_find_crs();
int _tb_login();
int _tb_mini_parse();
int _tb_mode();
int _tb_opn_crs();
int _tb_pre_trace();
int _tb_rollback_work();
int _tb_sdelpos();
int _tb_siud_src();
int _tb_sndevent();
int _tb_sndintr();
int _tb_sopncrs();
int _tb_sopn_si_crs();
int _tb_sort();
int _tb_spool();
int _tb_sseldec();
int _tb_sselrun();
int _tb_store_id();
int _tb_supdpos();
int _tb_timeout();
int _tb_use_db();
int _tb_use_ta();
void _tb_free();
void _tb_set_err();
#endif
#ifdef __cplusplus
}
#endif
#endif

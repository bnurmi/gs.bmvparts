/************************************************ 

                      T r a n s B a s e / C D
  @(#) tbcompat.h:   V6.1.2.19 (Build 404)
		Project: 4.119.1.19
		2004/08/05 11:46:57

  Copyright (c) 1995 - 
  Transaction Software GmbH
  D 81739 Munich 

 ***************************************************/

/* Module begin */
#ifndef _TBCOMPAT_H
#define _TBCOMPAT_H


/*********** Requests to TRANSBASE ****************/

#define CONNECT TB__CONNECT
#define DISCONNECT TB__DISCONNECT
#define LOGIN TB__LOGIN
#define BT TB__BT
#define CT TB__CT
#define AT TB__AT

#define DML TB__DML
#define GENTREE TB__GENTREE
#define RUN TB__RUN

#define CLOSE TB__CLOSE

#define EVAL TB__EVAL
#define DELPOS TB__DELPOS
#define UPDPOS TB__UPDPOS

#define GET_TA_STATE TB__GET_TA_STATE
#define GET_DB_STATE TB__GET_DB_STATE
#define GET_QU_STATE TB__GET_QU_STATE
#define SET_TIME_OUT TB__SET_TIME_OUT
#define SET_DAT_DIR TB__SET_DAT_DIR
#define GET_VERSION TB__GET_VERSION
#define SET_CONSISTENCY TB__SET_CONSISTENCY
#define CONTACTK TB__CONTACTK
#define ACCEPTK TB__ACCEPTK

#define TESTCOMM TB__TESTCOMM

#define OPEN_STORED TB__OPEN_STORED
#define RUN_STORED TB__RUN_STORED
#define UPDPOS_STORED TB__UPDPOS_STORED
#define DELPOS_STORED TB__DELPOS_STORED
#define STORE TB__STORE
#define DROP_STORED TB__DROP_STORED
#define DROP_ALLSTORED TB__DROP_ALLSTORED

#define GETBLOB TB__GETBLOB
#define MAKEBLOB TB__MAKEBLOB

#define SET_SORTORDER TB__SET_SORTORDER
#define GET_SORTORDER TB__GET_SORTORDER

#define TBMODE TB__TBMODE

#define SIG_HANDLE TB__SIG_HANDLE

#define DUMP_REQ_START TB__DUMP_REQ_START
#define MCONNECT TB__MCONNECT

#define SEND_EVENT TB__SEND_EVENT



#define ABORTCALLBACK TB__ABORTCALLBACK

#define GET_TBX_STATE TB__GET_TBX_STATE
#define MYCONNECT TB__MYCONNECT


/********	Coding of Types of attributes    **************/

#define UNDEFTYPE TB__UNDEFTYPE
#define TINYINT TB__TINYINT
#define SMALLINT TB__SMALLINT
#define INTEGER TB__INTEGER
#define IK_VALUE TB__IK_VALUE
#define NUMERIC TB__NUMERIC
#define FLOAT TB__FLOAT
#define DOUBLE TB__DOUBLE
#define CHAR TB__CHAR
#define DATETIME TB__DATETIME
#define TIMESPAN TB__TIMESPAN
#define MONEY TB__MONEY
#define BOOL TB__BOOL
#define BINCHAR TB__BINCHAR
#define BLOB TB__BLOB
#define BITSS TB__BITSS
#define NULLTYP TB__NULLTYP

#define STRING TB__CHAR
#define REAL TB__DOUBLE

#define MS TB__MS
#define SS TB__SS
#define MI TB__MI
#define HH TB__HH
#define DD TB__DD
#define MO TB__MO
#define YY TB__YY
#define WEEKDAY TB__WEEKDAY
#define UNDEFRANGE TB__UNDEFRANGE
#endif

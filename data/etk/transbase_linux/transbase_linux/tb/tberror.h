/************************************************ 

                      T r a n s B a s e / C D
  @(#) tberror.h:   V6.1.2.19 (Build 404)
		Project: 4.119.1.19
		2004/08/05 11:46:57

  Copyright (c) 1987 - 
  Transaction Software GmbH
  D 81739 Munich 

 ***************************************************/

/* Module begin */


#define	NO_ERROR	0
/* */
#define	ABORTSIGNAL	1
/* abort Signal received */
#define	CONFUSION	2
/* something has gone wrong in an unforeseen way!
 please consult TRANSBASE team */
#define	CRS_ALREADY_OPEN	3
/* invalid cursor state: %s already open */
#define	CRS_NOT_OPEN	4
/* invalid cursor state: %s not open */
#define	HARD_ERROR	5
/* transaction aborted */
#define	NO_SPACE_IN_ALLOC	6
/* out of heap space */
#define	PRE_TYPE_CONF	7
/* type conflict in assignment (%s = %s) */
#define	STRING_TOO_LONG	8
/* string constant/value too long, more than MAXSTRINGSIZE characters */
#define	SYNTAX_ERR	9
/* syntax error or access rule violation in dynamic SQL statement:\n%s */
#define	TB_STOP		10
/* Inconsistencies have been detected, Transbase stopped */
#define	MOUNT_FAULT	11
/* Volume Openfault%0.0s%0.0s%0.0s:	Please mount/link %s '%s' \n			to %s */
#define	TOO_MANY_CRS	12
/* too many open cursors (max. %d) */
#define	TOO_MANY_ROWS	13
/* more than one row in SELECT statement */
#define	ASN_TREE_TOO_LARGE	14
/* run out of heap space in ASN-tree construction */
#define	TUPLE_TOO_LARGE	15
/* tuple too large to fit in a page or too many attributes */
#define	TYPE_CONFLICT	16
/* wrong tuple type or types not matching between tuples */
#define	UNSOUND_KD	17
/* wrong key_desc rejected: %s %s (%d) %s */
#define	WRONG_ALIGNMENT	18
/* Alignment constraints have been violated */
#define	WRONG_PARAM	19
/* invalid parameter */
#define	NULL_NO_IND	20
/* data exception - null value, no indicator parameter (field %ld) */
#define	HARD_ICSQL_ERROR	21
/* ICSQL error: sqlcode = %d, transaction aborted */
#define	ALIGNMENT_ERR		22
/* Begin of Tuplespace not aligned to %d bytes */
#define	SLEN_TOO_SMALL	23
/* Length of char hostvariable is 1, cannot store string with '\0' */
#define	SO_ARR_TOO_SMALL	24
/* Size of %s[] must be >= 256 */
#define	BAD_ROMFILE	25
/* %s %s %s : This CDROM doesn't hold a database romfile */
#define	WRONG_ROMFILE	26
/* %s %s %s : This CDROM has wrong identifier (does not belong to the actual database) */
#define	CONFUSION_STR	27
/* unexpected: %s */
#define	VERSION_ROMFILE	28
/* The CD-ROM database version (%ld.%ld.%ld) is incompatible with the Transbase kernel version (%ld.%ld.%ld) */
#define	VERSION_DISKFILE  29
/* The database version (%ld.%ld.%ld) is incompatible with the Transbase kernel version (%ld.%ld.%ld) */
#define	WRONG_TYPE_CODE	30
/* unknown field type code %ld */
#define	BC_TUPLE_TOO_LARGE	31
/* tuple too large to fit in a binary-compatible database page */
#define INVALID_SQL_STMT_NAME	32
/* invalid SQL statement name:\n%s */
#define USE_CLAUSE_REQUIRED	33
/* dynamic SQL error - using clause required for dynamic parameters */
#define OUTP_PARAMNO_MISM	34
/* dynamic SQL error - using clause does not match target specifications:\ncount <> number of fields */
#define INP_PARAMNO_MISM	35
/* dynamic SQL error - using clause does not match dynamic parameter specifications:\n%s */
#define SQLDESCR_ALREADY_KNOWN	36
/* invalid SQL descriptor name: %s already known */
#define SQLDESCR_NOT_KNOWN	37
/* invalid SQL descriptor name: %s not known */
#define INVAL_SQLDESCR_IDX	38
/* dynamic SQL error - invalid descriptor index (%ld) */
#define	DIN_INVAL_VAL	39
/* dynamic SQL error - descriptor item name %s has an invalid value */
#define NOT_A_CRS_SPEC	40
/* dynamic SQL error - prepared statement is not a cursor specification */
#define	DE_ERR_ASS	41
/* data exception - error in assignment: type conflict */
#define WARN_INSUFF_ITEMS	42
/* warning - insufficient item descriptor areas: requested: %ld, maximum: %ld */
#define CRS_NOT_EXECUTABLE	43
/* dynamic SQL error - cursor specification cannot be executed */
#define RES_CLAUSE_REQUIRED	44
/* dynamic SQL error - using clause required for result fields */
#define	DMG_TAB	5000
/* tab-entry for transaction %d has been damaged */
#define	MUST_ABORT	45
/* Must abort transaction */
#define INVALID_CRS_STATE	46
/* invalid cursor state */
#define INVALID_CRSNAME	47
/* invalid cursor name: %s */
#define INVALID_CRSNAME_STATE	48
/* invalid cursor state: %s */
#define	FIELD_NO_MISMATCH	5001
/* number of specified fields does not match table or query expression: %s */
#define	SAVEPOINT_DEFINITION	5002
/* cannot define savepoint '%s' (already exists or operation not available) */
#define	UNDEFINED_SAVEPOINT	5003
/* cannot apply savepoint '%s' (does not exists) */
#define	ILL_FORMAT	5004
/* %2ld format errors found
%ld tuples spooled %ld duplicates ignored, last tuple in line %d , first error in line %ld */
#define	ILL_QU_ID	5005
/* illegal qu_id %d */
#define	ILLEGAL_POS_ON_NOT_SCROLL	5006
/* on a not-scrollable query (%ld), a scroll request has been issued onto position %ld */
#define	ILL_TA_ID	5007
/* illegal ta_id %d */
#define	NAME_CONFLICT	5008
/* duplicate in names: %s */
#define	NO_TA_ACTIVE	5009
/* transaction not found */
#define	TB_NOT_SET	5010
/* shell-Variable 'TRANSBASE' not set */
#define	ILL_ST_ID	5011
/* illegal id %d for stored query */
#define	SOFT_ICSQL_ERROR	5012
/* ICSQL error: sqlcode = %d, transaction not aborted */
#define	ILL_BDMODE	5013
/* Illegal mode in Blobdesc (%d) */
#define FILEREF_NOT_AVAIL	5014
/* The GetFileref Feature is not enabled */
#define SCROLL_ON_FOR_UPDATE	5015
/* Scrolling Cursor not allowed on SELECT  .. FOR UPDATE */
#define UNSOUND_TRIGGER_PARAMETER	5016
/* cannot supply parameter %ld (total %ld) from old/new with arity %ld and %ld */
#define	LADDR_CNFOFLOW	200
/* Can not represent large address (%lu,%u; blocksize %u) with blocksize %u */
#define	LADDR_OFLOW	201
/* Overflow in sum of large addresses ((%lu,%u), (%lu,%u), %lu) */
#define	LADDR_UFLOW	202
/* Underflow in difference of large addresses ((%lu,%u), (%lu,%u), %lu) */
#define	FLY_SORT_PROTOCOL	300
/* wrong protocol for fly sorter */
#define	BBSPOOL_FAULT	301
/* wrong sc_id or protocol for bbspooler */
#define	DIM_NOT_IN_STEP	302
/* Ubvalue: step too small for dimension access */
#define MAX_DIMS_REACHED  303
/* maximum number of dimensions reached, which is %d (recompile kernel module 'tbubrq.c' with new setting of MAX_DIMS) */
#define	IK_NOT_OCCUPIED	304
/* this ik-value does not exist */
#define	NOT_B_TREE	306
/* segment doesn't hold a B_Tree */
#define	NOT_SCRATCH	307
/* segment doesn't hold a tempfile */
#define	NO_IK_TABLE	308
/* a tree of this type doesn't maintain IK's (%s)*/
#define	QBOX_PROTOCOL	309
/* call sequence of bb_querybox function */
#define	NO_TUPLE_READ	310
/* no tuple has been read up to now */
#define	SEPARATOR_TOO_LONG	312
/* separator_tuple in B-Tree is too long */
#define	SORTER_CONTENTION	313
/* sorter out of memory: increasing "Sorter Cache Size" could help */
#define	TEMP_FILE_OCCUPIED	315
/* there are other active scans on this file */
#define	TREE_NOT_EMPTY	316
/* tree to be spooled is not empty */
#define	TREE_OCCUPIED	317
/* there are other active scans on this tree */
#define	UNDEF_RESET_POINT	318
/* reset_point is not defined */
#define	UNDEF_SCAN	319
/* B-Tree Access via an undefined Scan (%d) */
#define	WRONG_SCAN_TYPE		320
/* Used Scan (%d) has wrong Type */
#define	UNSOUND_PARAMS	321
/* wrong parameters for sorter */
#define	UNSOUND_SCANS	322
/* scans not open or open on different segments */
#define	WRONG_SC_POS	323
/* wrong scan position for this call */
#define	HEAP_NOT_OKAY	324
/* heap in sorter not okay */
#define	BB_CONFUSION	325
/* Confusion in BBMAN (%s %ld %ld %ld %ld %ld);\n Please contact Transbase Team ! */
#define	BB_VERSION	326
/* Wrong B-Tree Version (%s %ld %ld %ld %ld %ld);\n Please contact Transbase Team ! */
#define	BB_PGTOOSMALL	327
/*  Pagesize (%d) too small to hold B-Tree pages  (%d %d %d) */
#define	WRONG_SEP	328
/* wrong separator (%ld,%ld,%ld,%ld,%ld,%ld) */
#define	TREELEVEL_OVERFLOW	329
/* Overflow of BTREE_LEVELS (%d %d)\n Please Contact Transbase Team */
#define	WRONG_SAVEPOINT_PROT	330
/* Illegal Savepoint protocol in %s */
#define	UNSOUND_INPUT 331
/* wrong input for %s: %ld %ld %ld %ld %ld*/
#define	UNSOUND_MODE 332
/* wrong mode for %s: scid=%d, mode=%d */
#define	SORT_ORDER_BBSPOOL 333
/* bbspooler sees violation of key sortorder: tuple %ld */
#define	CANNT_ALLOC_IK 334
/* requested ik-value can't be allocated (%s %d) */
#define	DUPLICATES_IN_NONDUP_TREE 335
/* duplicates in keys: tuple %ld */
#define	UNSOUND_TUPLE   338
/* Delivered tuples attr-pointers don't correspond to stored ones */
#define	UNSOUND_PGTYPE   340
/* %s: Pg_type (%d) unsound for conversion */
#define	UNSOUND_ATTRTYPE   344
/* %s: Attr_type (%d) unsound for conversion */
#define       UNDEF_SUAI      360
 /* Can't construct Sua_Info (%s %d %d %d %d %d) */
#define	UD_CONFUSION	362
/* Confusion in BBUNDO (%s %ld %ld %ld %ld %ld);\n Please contact Transbase Team ! */
#define	ILL_NIB_DESC	401
/* Illegal nibtree descriptor (%d) */
#define	ILL_NIB_TREE_TYPE	402
/* Nibtree element size (%d) does not match requested size (%d) */
#define	LEAF_NOT_WFIXED	403
/* Nibtree leaf not wfixed at write */
#define	INVAL_SEGID	404
/* Invalid segid */
#define	INDEX_NOT_ON_LEAF 405
/* Index > max. index on page (%lu > %d) */
#define CRS_NOT_SCROLLABLE	5900
/* cursor is not scrollable */
#define CRS_WRONG_TYPE	5901
/* this is not a scrollable select cursor */
#define CRS_WRONG_POSMODE	5902
/* invalid position mode specified */
#define CRS_ABSPOS_ERROR	5903
/* invalid absolute position, value 0 not allowed */
#define CRS_RELPOS_ERROR	5904
/* invalid relative backward position, not on row */
#define CONFUSION_SCROLL 4000
/* didn't find row number %ld in buffer */
#define	FILE_EXISTS	6000
/* TB-file %s exists */
#define	FILE_NOT_EXISTS	6001
/* TB-file %s does not exist */
#define	ILL_FD	6002
/* illegal TB-fd %d */
#define	ILL_MODE	6003
/* TB-file is in mode 0%o, action not allowed */
#define	ILL_WHENCE	6007
/* Illegal value for whence (%d) */
#define	ILL_LRU_DEL	900
/* tried to delete top element of lru and 'with_first' was FALSE */
#define	CAT_NO_MATCH	901
/* cat_fix/cat_unfix call (%s) does not match previous call (%s) */
#define	CAT_WRONG_FIX	902
/* wrong fixcnt in catalog manager (%s) */
#define	DUPL_IN_UNIQ_INDEX	903
/* a duplicate is in unique index '%s' */
#define	ILL_TABLE_SEG_REQ	904
/* cannot create table %s with segment number %d: occupied */
#define	WRONG_KEY_ORDER	905
/* key order of HyperCube should be: %s */
#define	NOT_ENOUGH_SPACE	906
/* not enough shared memory space */
#define	NO_DATA_B_TREE	907
/* can't create index on B-Tree without IK's */
#define	SEGNO_NOT_FOUND	908
/* cannot find segment %d in systable */
#define	SORT_FAULT	909
/* illegal sort order in line %ld */
#define	NULL_VALUE_ON_HCSECTREE	910
/* NULL value not allowed on keyfield of hypercube index '%s' (field position %ld) */
#define	CAT_ILL_IPR_PROT	911
/* illegal ipreter protocol in catalog manager (%s) */
#define	ILL_CATBUF_MODE	912
/* illegal mode in Catbuf_desc (%d) */
#define	SPOOL_INS	913
/* can't insert tuple in line %ld because key already exists */
#define	SPOOL_INS_2	914
/* duplicate in key (of base table) detected (at input line %ld); \nto find out all duplicates follow the procedure in the SQL Manual chapter "Spooler" */
#define	INCONSISTENT_SYSREMOTE	915
/* entry not found for dbid=%ld */
#define FUNC_NOSQL 1000
/* access rule violation: function '%s' issued an SQL statement though it was\ndeclared NO SQL */ 
#define PROC_NOSQL 1001
/* access rule violation: procedure '%s' issued an SQL statement though it was\ndeclared NO SQL */ 
#define FUNC_SQLACCESS 1002
/* access rule violation: function '%s' issued a DML statement though it was\ndeclared CONTAINS SQL only */ 
#define PROC_SQLACCESS 1003
/* access rule violation: procedure '%s' issued a DML statement though it was\ndeclared CONTAINS SQL only */ 
#define FUNC_SQLREADDATA 1004
/* access rule violation: function '%s' issued a SELECT statement though it was\ndeclared CONTAINS SQL only */ 
#define PROC_SQLREADDATA 1005
/* access rule violation: procedure '%s' issued a SELECT statement though it was\ndeclared CONTAINS SQL only */ 
#define FUNC_SQLMODIFYDATA 1006
/* access rule violation: function '%s' issued a DML statement though it was\ndeclared READS SQL DATA only */ 
#define PROC_SQLMODIFYDATA 1007
/* access rule violation: procedure '%s' issued a DML statement though it was\ndeclared READS SQL DATA only */ 
#define FINALIZER_NOSQL 1008
/* access rule violation: finalizer %s issued an SQL statement */
#define REMOTE_HARD_ERROR 1009
/* Remote query execution on database %s@%s returned an error: %ld\n%s */
#define	ACC_PRIV_EXP	8000
/* compile error:  access privilege expected: %s */
#define	AS_EXPEC	8001
/* compile error:  'AS' expected: %s */
#define	ATTRPOS_MISMATCH	8002
/*  incorrect number of Attribut-positons:  %s */
#define	ATTR_NOT_FOUND	8003
/* '%s' is not a field of %s '%s' */
#define	SEQUENCE_NOT_FOUND	8004
/* table '%s' is not a sequence */
#define	FILE_TOO_LARGE	8005
/* file %s larger than input buffer %d */
#define	CHECK_EXP	8006
/* compile error:  'CHECK' expected: %s */
#define	COLPRIV_NOT_FOUND	8007
/* user '%s' does not have '%s' privilege on field '%s' of table '%s' */
#define	FULLTEXT_EXP	8008
/* compile error:  keyword FULLTEXT expected: %s */
#define	C_RELATION_OR_INDEX	8009
/* compile error:  one of the following keywords expected:\nTABLE,VIEW,INDEX,DOMAIN,POSITIONAL,FULLTEXT,UNIQUE,TRIGGER,EXTERNAL,FUNCTION,\nor PROCEDURE: %s */
#define	DOUBLE_DEFINE	8010
/* field '%s' was defined twice as key */
#define	DUPL_FIELDNAME	8011
/* compile error:  duplicate in field list: %s */
#define	DUPL_PRIV	8012
/* duplicate in privilege list: %s */
#define	ILLEGAL_FULLTEXT_OPTIONS	8013
/* duplicates or errors in fulltext options specification: %s */
#define	DUPL_USER_NAME	8014
/* compile error:  duplicate in user list: %s */
#define	D_RELATION_OR_INDEX	8015
/* compile error: one of the following keywords expected:\nTABLE,VIEW (or SELECT statement),INDEX,DOMAIN,TRIGGER,EXTERNAL,FUNCTION,\nor PROCEDURE: %s */
#define	ERR_DELIM_VAL	8016
/* compile error:  syntax error in delimiter-value:  %s */
#define	ERR_FILENAME	8017
/* compile error:  external filename expected:  %s */
#define	ERR_NULLSIGN_VAL	8018
/* compile error:  syntax error in nullsign-value:  %s */
#define	ERR_SELECT	8019
/* compile error:  only a pure SELECT statement allowed in this context */
#define	ILLEGAL_UNGROUP	8020
/* compile error:  only 1 field in UNGROUP allowed: %s */
#define	ERR_STATEMENT	8021
/* compile error:  statement expected: %s */
#define	CD_DB_ONLY	8022
/* compile error:  this statement only allowed on CD database (Editorial or Retrieval) */
#define	CD_EDIT_DB_ONLY	8023
/* compile error:  this statement only allowed on CD Editorial DB */
#define	ILLEGAL_NAME_LIST	8024
/* compile error:  illegal name list:  %s */
#define	MISSING_UB_CONSTRAINT	8025
/* HyperCube needs constraint on each keyfield: missing for field %s */
#define	GRANT_EXP	8026
/* compile error:  'GRANT' expected: %s */
#define	WRONG_INDEX_TYPE	8027
/* index %s has not the required type (fulltext / standard) */
#define	IDENT_INDEX_EXISTS	8028
/* an index on these field(s) already exists */
#define	ID_TOO_LONG	8029
/* compile error:  identifier too long: %s */
#define	ILLEGAL_CHECK_OPTION	8030
/* illegal check option: view not updatable */
#define	ILL_GRANT	8031
/* cannot grant because user '%s' has already '%s' permission */
#define	ILL_REVOKE	8032
/* cannot revoke because user '%s' does not have '%s' permission */
#define	INDEXNAME_EXISTS	8033
/* an index with name '%s' already exists */
#define	INDEXNAME_EXP	8034
/* compile error:  name of index expected: %s */
#define	INDEX_EXP	8035
/* 'INDEX' expected: %s */
#define	INDEX_NOT_FOUND	8036
/* an index '%s' does not exist */
#define	WRONG_TYPE_FOR_UBTREE	8037
/* in field '%s': fieldtype '%s' not supported for ubtree or "not null" missing */
#define	IS_EXPEC	8038
/* compile error:  'IS' expected: %s */
#define	LOCKMODE_EXP	8039
/* lockmode READ / UPDATE/ EXCLUSIVE expected: %s */
#define	ILLEGAL_VIEW_FULLTEXT	8040
/* compile error: illegal to use a special FULLTEXT table for view */
#define	NO_PRIV	8041
/* user '%s' has not the privilege to %s '%s' */
#define	CONTRADICTION_IN_UNIQUE_SPEC	8042
/* compile error:  inconsistent UNIQUE specifications in CREATE INDEX */
#define	NULL_EXPEC	8043
/* compile error:  'NULL' expected: %s */
#define	ON_EXP	8044
/* compile error:  'ON' expected: %s */
#define	OPTION_EXP	8045
/* compile error:  'OPTION' expected: %s */
#define	OWNER_GRANT	8046
/* grant / revoke not allowed because '%s' is owner of '%s' */
#define	PASSWD_EXP	8047
/* compile error:  password (enclosed in '...') expected: %s */
#define	DROP_RESTRICT	8048
/* compile error:  cannot DROP with RESTRICT: object '%s' occurs in '%s' */
#define	ILLEGAL_OP_ON_VIEW	8049
/* operation %s not allowed on view */
#define	PRIV_NOT_FOUND	8050
/* user '%s' does not have '%s' privilege on table or view '%s' */
#define	REL_ATTR_NO_EX	8051
/* compile error:  number of fields exceeds MAXATTRNO */
#define	REL_EXISTS	8052
/* cannot create because object '%s' already exists */
#define	REL_NOT_FOUND	8053
/* table '%s' does not exist or is view */
#define	REL_NOT_REMOVABLE	8054
/* table '%s' not removable */
#define	SELF_GRANT	8055
/* grant / revoke from user '%s' to '%s' not allowed */
#define	SYS_LOCK	8056
/* illegal lock operation on system table */
#define	TOO_MANY_GRANTEES	8057
/* compile error:  list of usernames too long */
#define	TO_EXP	8058
/* compile error:  'TO' expected: %s */
#define	DOMAIN_NOT_FOUND	8059
/* compile error:  domain or base type '%s' does not exist */
#define	CONSTRAINT_NAME_EXPEC	8060
/* compile error:  constraint name expected: %s */
#define	USER_EXP	8061
/* compile error:  user name expected: %s */
#define	USER_ID_TOO_LONG	8062
/* compile error:  userid or password %s too long - exceeds MAXIDENTSIZE characters */
#define	USER_NOT_FOUND	8063
/* unknown user %s */
#define	VIEW_NOT_FOUND	8064
/* a view '%s' does not exist */
#define	WANTED_SNO	8065
/* segno mismatch, wanted=%ld, get=%ld */
#define	WITH_EXP	8066
/* compile error:  'WITH CHECK OPTION' or end of statement expected: %s */
#define	WRITE_FAULT	8067
/* cannot write to file %s */
#define	WRONG_PASSWD	8068
/* wrong password */
#define	ICSQL_QUERY_TOO_LARGE	8069
/* ICSQL query too large */
#define	VIEW_TOO_LARGE	8070
/* Compiled view is too large; split it into smaller pieces */
#define	INVAL_SC_PROT	8071
/* invalid ICSQL protocol */
#define	BCONT_NOT_FOUND	8072
/* table '%s' has no blobs */
#define	TABLE_WITHOUT_IK	8073
/* table '%s' has no IKACCESS */
#define	INDEX_WITHOUT_IK	8074
/* can't create index on table without IKACCESS */
#define	NOT_LOADABLE	8075
/* a object '%s' not loadable (is view) */
#define	ILLEGAL_DEVICE	8076
/* compile error:  illegal device in segid specification : %s */
#define	DATETIME_EXP	8077
/* compile error:  'DATETIME' expected: %s */
#define	INVAL_VALUE	8078
/* Invalid literal for structure field: %s */
#define	ILLEGAL_UNGROUP_TYPE	8079
/* compile error:  only type BITS allowed for UNGROUP */
#define	ILL_CLUSTER	8080
/* illegal cluster number %d; highest legal number would be %d */
#define	ILL_CLUSTER_START	8081
/* illegal cluster start number %ld; highest block already %ld  */
#define	BLOB_KEY	8082
/* compile error: a blob field cannot be part of key  */
#define	ILL_TYPE_SEC_INDEX	8083
/* compile error: secondary index on type BLOB not allowed (only fulltext index) */
#define	ILL_TYPE_FTXT_INDEX	8084
/* compile error: fulltext index only allowed on fieldtypes BLOB,(VAR)CHAR,FILEREF */
#define	UNEXPECTED_KEYWORD	8085
/* compile error: unexpected keyword: %s */
#define	CONSTRAINT_BODY_EXPEC	8086
/* compile error:  constraint body expected: %s */
#define	MULTIPLE_KEY_CLAUSE	8087
/* compile error: more than one PRIMARY KEY clause */
#define	DEFVAL_TYPE_MISMATCH	8088
/* compile error: default value does not match field type: %s */
#define	ILLEGAL_CONSTRAINT_REF	8089
/* compile error: constraint %s references field '%s' which is out of scope */
#define	CONSTRAINT_NAME_EXISTS	8090
/* compile error: constraint name '%s' exists */
#define	PROBLEMS_CONSTRAINTNAME	8091
/* compile error: problems to find default constraintnames; please name constraints explicitly */
#define	DOMAIN_NAME_EXPEC	8092
/* compile error:  domain name expected: %s */
#define	ILLEGAL_CONSTRAINT	8093
/* compile error: illegal element within constraint in this context */
#define	DOMAIN_EXISTS	8094
/* cannot create because domain '%s' already exists */
#define	DROP_BEHAVE_EXPEC	8095
/* compile error:  drop behavior ( RESTRICT | CASCADE ) expected: %s */
#define	ILLEGAL_ON_VIEW	8096
/* compile error:  illegal operation on view '%s' */
#define	CONSTRAINT_NOT_EXISTS	8097
/* compile error:  tableconstraint '%s' does not exist */
#define	ILLEGAL_ALTERTABLE_ADDCONSTR 8098
/* compile error:  illegal constraint for ALTER TABLE */
#define	REFTYPE_MISMATCH	8099
/* compile error:  in REFERENCES clause, fieldtypes do not match (in field pair %ld)\n%s */
#define	ILLEGAL_CYCLREF	8100
/* compile error:  in REFERENCES clause, target and source fields are identical: %s */
#define	FTXT_CREATE_ARITY	8101
/* wrong arity of table '%s' supplied for fulltext creation */
#define	FTXT_CREATE_TYPES	8102
/* wrong field type(s) in table '%s' supplied for fulltext creation */
#define	CONSTRAINT_UB_USED	8103
/* compile error:  tableconstraint '%s' is used for value ranges in hypercube tree(s) '%s' and thus cannot be dropped */
#define	SYSTEM_RESERVED_NAME	8104
/* compile error: names starting with '@@sys' are system reserved: %s */
#define	INSENS_NAME_COLLISION	8105
/* case insensity collision of existing object names; run script '%s' to see all collisions */
#define	SEQUENCE_IN_USE_DEFAULT	8106
/* sequence '%s' is used in field default definition in table '%s' */
#define	SEQUENCE_IN_USE_VIEW	8107
/* sequence '%s' is used in view definition of '%s' */
#define	ILLEGAL_BIT_NESTING	8108
/* Bitnesting specification %ld exceeds bitlength %ld of hypercube key '%s' */
#define RESOURCENAME_EXPEC		8150
/* compile error: a resourcename was expected: %s */
#define RESOURCENAME_MISMATCH	8151
/* compile error: resourcename and filename (without extension) must be identical: %s */
#define UNKNOWN_EXTERNAL_TYPE	8153
/* compile error: unknown external resource type '%s'.\nCREATE EXTERNAL accepts files with JAVA, CLASS and JAR extensions */
#define UNKNOWN_EXTERNAL_SUBTYPE	8154
/* compile error: external subtypes SOURCE or BINARY require preparatory type specification: CLASS or JAR: %s */
#define EXTERNAL_TYPE_MISMATCH	8155
/* compile error: the file type does not match to the specified resource type: %s */
#define UNKNOWN_EXTERNAL_OPTION	8156
/* compile error: one of the following option keywords was expected: JAVA,JDK,CLASSPATH,JAVADEBUG: %s */
#define EXTERNALOPTION_EXPEC	8157
/* compile error: double quoted external option string expected: %s */
#define OPTION_DUPLICATE		8158
/* compile error: an option was defined twice: %s */
#define SQLNAME_EXPEC 8159
/* compile error: sqlname identifier expected: %s */
#define METHODNAME_EXPEC 8160
/* compile error: methodfullname identifier expected: %s */
#define USE_DOUBLE_QUOTES		8161
/* compile error: use double quotes for external name: %s */
#define PARAMNAME_EXPECTED		8162
/* compile error: signature declaration not consistent. Supply names for all or none of the parameters: %s */
#define UNEXPECTED_PARAMNAME	8163
/* compile error: signature declaration not consistent. Supply names for all or none of the parameters: %s */
#define UNEXPECTED_PARAMMODE	8164
/* compile error: illegal %s or IN%sOUT parameter %s:  %s */
#define INVALID_METHODFULLNAME	8166
/* compile error: the fully qualified methodname is reqired, like "classfullname.methodname": %s */
#define INVALID_EXTSIGNATURE 8167
/* compile error: this external signature is not valid: %s */
#define TOO_MANY_PARAMS			8168
/* compile error: too many params (limited to %ld) or signature string too long */
#define INVALID_NULLOPTION		8169
/* compile error: CALLED ON NULL INPUT and RETURNS NULL ON NULL INPUT may only be specified with FUNCTIONS: %s */
#define INVALID_RESULTOPTION	8170
/* compile error: DYNAMIC RESULT SETS may only be specified with PROCEDURES: %s */
#define	ILLEGAL_RESULTSETS		8171
/* illegal (negative) value for DYNAMIC RESULT SETS: %s */
#define COMMENT_EXPEC			8172
/* compile error: a double quoted COMMENT was expected: %s */
#define GRANT_USAGE_EXCL		8173
/* compile error: cannot GRANT USAGE with other privileges SELECT, INSERT, DELETE, or UPDATE in one statement: %s */
#define REVOKE_USAGE_EXCL		8174
/* compile error: cannot REVOKE USAGE with other privileges SELECT, INSERT, DELETE, or UPDATE in one statement: %s */
#define EXTERNAL_TYPE_EXPEC		8175
/* compile error: specify the extenal object type CLASS, JAR, EXTERNAL, PROCEDURE, or FUNCTION for GRANT/REVOKE: %s */
#define NOTIMPLEMENTED			8199	/* TEMP */
/* compile error: feature not yet implemented: %s */
#define	REFERENCE_CONSTRAINT_SURR_USED	8200
/* compile error:  reference constraint '%s' cannot be dropped because used in conjunction with a reference surrogate '%s' */
#define	REL_NOT_REMOVABLE_REFSURR	8201
/* table '%s' not removable because table '%s' has a reference surrogate on it */
#define INDEX_INCONSISTENCY	8202
/* Index is inconsistent to cs values */
#define UNIQUE_HCKEY_NOT_ALLOWED	8203
/* No UNIQUE HCKEY allowed for hc key attribute '%s' */
#define UNDEFINED_FIELD_NAME_VIEW	8204
/* Field with number %ld has no valid name: use explicit field name list or AS clause for the expression in SELECT */
#define ERROR_IN_TRIGGER_CAT	8205
/* In trigger '%s' , UPDATE clause contains field '%s' which is not found in rel_desc of '%s' */
#define ERROR_IN_USERTRIGGER_EXECUTION	8206
/* Error during execution of user trigger '%s' , action number '%ld' (incarnation %ld of query processor) */
#define ERROR_IN_REFCTRIGGER_EXECUTION	8207
/* Error during execution of referential constraint '%s' , triggered action '%s' (incarnation %ld of query processor) */
#define GRANT_SENSITIVE_USERNAME	8208
/* Cannot grant access to username containing lowercase letters on case insensitive database: '%s' */
#define REVOKE_TBADMIN	8209
/* Cannot revoke access from tbadmin */
#define	AGGR_ILL_ARG	9000
/* compile error:  in aggr function '%s' argument is illegal or could not be resolved */
#define	AGGR_IN_WHERE	9001
/* compile error:  aggr function '%s' is used inside WHERE clause of its resolution block */
#define	AGGR_NESTED	9002
/* compile error:  in aggr function '%s' another aggr function referring to same or inner block is used */
#define	AMBIGUOUS_T_V	9003
/* compile error:  table or correlation name '%s' is not unique in block %ld */
#define	AND_OR_BETW_QUAL_EXPEC	9004
/* compile error:  'AND' or BETWEEN-qualifier expected: %s */
#define	ATTR_REFERENCE	9005
/* compile error:  field '%s' is not a grouping column */
#define	CON_OF_TYPE	9006
/* compile error:  in line <%ld>: type conflict of operands involving '%s' */
#define	CON_OF_ARITY	9007
/* compile error:  in line <%ld>: mismatch of arity in set comparison involving '%s' */
#define	CLOSURE_ARITY	9008
/* compile error:  closure operator needs input tuples of arity 2 instead of %d */
#define	CLOSURE_TYPES	9009
/* compile error:  for closure operator, both input fields must have same type */
#define	KEYWORD_EXPEC	9010
/* compile error:  keyword '%s' expected: %s */
#define	TOO_MANY_EXPR_CASE	9011
/* compile error:  too many components in CASE expression */
#define	DOUBLE_FIELDNAME	9012
/* compile error:  fieldname occurs twice in fieldname list: %s */
#define	REFFIELD_MISMATCH	9013
/* compile error:  in REFERENCES clause, number of referencing fields (%ld) does not match number of referenced fields (%ld) */
#define	END_EXPEC	9014
/* compile error:  syntax error: %s */
#define	EQ_EXPEC	9015
/* compile error:  '=' expected: %s */
#define	SPECIAL_FTXT_TABLE_NAME_EXPEC	9016
/* compile error:  one of 'wordlist','wordindex','charmap','stopwords','delimiters' expected: %s */
#define	OF_EXPEC	9017
/* compile error:  'OF' after date/time selector expected: %s */
#define	FIELD_NOT_IN_REL	9018
/* compile error:  '%s' is not a field of '%s', block %d, depth %d */
#define	FIELD_MISMATCH	9019
/* compile error:  wrong number of values or wrong tuple arity: %s */
#define	FIELD_NAME_EXPEC	9020
/* compile error:  field-name expected: %s */
#define	FI_EXPEC	9021
/* compile error:  'FI' expected: %s */
#define	FROM1_EXPEC	9022
/* compile error:  'FROM' or expression expected: %s */
#define	FROM_EXPEC	9023
/* compile error:  'FROM' expected: %s */
#define	IFS_EXPEC	9024
/* compile error:  pos. integer or field name expected after 'ORDER BY': %s */
#define	IF_EXPEC	9025
/* compile error:  'IF' expected: %s */
#define	ILLEGAL_ATTRPOS	9026
/* compile error:  illegal field reference position %d */
#define	ILLEGAL_NODE	9027
/* compile error:  illegal node: %s */
#define	ILLEGAL_NODE_SPEC	9028
/* illegal specifier for %s */
#define	ABS_FILE_EXPEC	9029
/* absolute path name expected for file specification */
#define	ILLEGAL_SYNTAX	9030
/* compile error:  illegal syntax: %s */
#define	ILL_AGGR_TYPE	9031
/* compile error:  illegal input type in aggr funct '%s' */
#define	ILL_AGGR	9032
/* compile error:  illegal usage of aggr funct '%s' */
#define	ILL_AGGR_POS	9033
/* compile error:  %d is an illegal aggr position */
#define	ILLEGAL_DEFAULT	9034
/* compile error:  keyword DEFAULT not allowed in this context */
#define	NOT_UNIQUE_REFERENCES	9035
/* compile error: referenced field(s) not unique in table '%s'; must be PRIMARY KEY (complete and in ascending order) or UNIQUE-INDEXED */
#define	ILL_GROUP_POS	9036
/* compile error:  %d is an illegal group position */
#define	ILLEGAL_ELEM_USING 9037
/* compile error:  fieldname '%s' not found in %s operand: %s */
#define	ILLEGAL_FIELD_QUAL 9038
/* compile error:  illegal qualification of fieldname: %s */
#define	ILL_MJOIN_POS	9039
/* compile error:  %d is an illegal mjoin position on %s side */
#define	ILL_ORDER_NAME	9040
/* compile error:  illegal ORDER BY: '%s' is not a (unqualified) fieldname in SELECT list */
#define	ILL_ORDER_POS	9041
/* compile error:  %ld is an illegal sort position */
#define	ILL_POS	9042
/* compile error:  illegal Attribute position %d */
#define	ARITY_MISMATCH	9043
/* compile error:  mismatch in fieldnumbers in operation UNION/INTERSECTION/DIFF: %s */
#define	BUILD_TUP_ARITY	9044
/* compile error:  non-unary argument for tuple construction */
#define	ILL_USE_OF_BY	9045
/* compile error:  argument of group by must refer to current block: %s */
#define	INCONSISTENT_CATALOG	9046
/* compile error:  inconsistent catalog: %s */
#define	INTO_EXPEC	9047
/* compile error:  'INTO' expected: %s */
#define	INT_EXPEC	9048
/* compile error:  integer expected: %s */
#define	DUPLICATE_FIELDNAME_JOIN	9049
/* compile error:  duplicate fieldname on position %ld and %ld (%s) in %s operand of JOIN: %s */
#define	I_N_EXPEC	9050
/* compile error:  index name expected: %s */
#define	LBRACE_EXPEC	9051
/* compile error:  '{' expected: %s */
#define	LBRA_EXPEC	9052
/* compile error:  '[' expected: %s */
#define	LPAR_EXPEC	9053
/* compile or cast error:  '(' expected: %s */
#define	NODE_ID_EXPEC	9054
/* compile error:  node id expected: %s */
#define	NODE_MUL_DEF	9055
/* compile error:  node %s multiply defined */
#define	NOT_UPDATABLE	9056
/* compile error:  no updates allowed */
#define	NO_SEARCH_COND	9057
/* compile error:  in line <%ld>: no search condition in '%s' */
#define	NO_PRIM_KEY_SEEN	9058
/* compile error:  for self referencing FOREIGN KEY with implicit target list, not yet the PRIMARY KEY seen: %s */
#define	REF_AMBIGUOUS_PA1	9059
/* compile error:  field reference '%s' ambiguous %s : %s */
#define	REF_AMBIGUOUS_PA2	9060
/* compile error:  field reference '%s' ambiguous, block %d, depth %d */
#define	NUMBER_EXPEC	9061
/* Number after filling-symbol expected */
#define	OPERATOR_EXPEC	9062
/* compile error:  node operator expected: %s */
#define	POS_INT_EXPEC	9063
/* compile error:  positive integer expected: %s */
#define	PRE_END_OF_STATEMENT	9064
/* compile error:  premature end of statement */
#define	INT2_EXPECTED	9065
/* compile error: 2-byte integer expected, possibly overflow: %s */
#define	INT1_EXPECTED	9066
/* compile error: 1-byte integer expected, possibly overflow: %s */
#define	RBRACE_EXPEC	9067
/* compile error:  '}' expected: %s */
#define	RBRA_EXPEC	9068
/* compile error:  ']' expected: %s */
#define	REF_NOT_FOUND	obs9069
/* obsolete: has been renamed to REF2_NOT_FOUND, upw. comp. to 41 MyClients */
#define	REF2_NOT_FOUND	9069
/* compile error:  field '%s' not resolvable, block %d, depth %d: %s\n%s */
#define	ILLEGAL_SUBQUERY 9070
/* compile error:  subquery not allowed in this context: %s */
#define	RPAR_EXPEC	9071
/* compile error:  ')' expected: %s */
#define	SET_EXPEC	9072
/* compile error:  keyword SET expected: %s */
#define	SUBQUERY_EXPEC	9073
/* compile error:  subquery expected: %s */
#define	TABLEREF_EXPEC	9074
/* compile error:  table reference expected: %s */
#define	TABLE_NAME_EXPEC	9075
/* compile error:  table name expected: %s */
#define	THEN_EXPEC	9076
/* compile error:  'THEN' expected: %s */
#define	TMF_IN_TPL	9077
/* compile error:  too many fields in input or result tuple */
#define	TOO_FEW_SONS	9078
/* compile error:  too few sons for node %s: %s */
#define	TOO_MANY_SONS	9079
/* compile error:  too many sons for node %s: %s */
#define	TOO_MANY_SPECIFIERS	9080
/* too many specifiers */
#define	BASETYPE_EXPEC	9081
/* compile error:  basetype specification expected: %s */
#define	UD_RELATION	9082
/* compile error:  undefined table '%s' */
#define	UD_VIEW	9083
/* compile error:  view '%s' is missing in catalog relation sysview */
#define	UNKNOWN_NODE_ID	9084
/* compile error:  unknown node id: %s */
#define	VALUE_LIST_TOO_SMALL	9085
/* compile error:  value list is too small: %s */
#define	VALUE_LIST_TOO_LARGE	9086
/* compile error:  too many values in value list: %s */
#define	WRONG_COLUMN_SPEC	9087
/* compile error:  wrong field specification %s */
#define	WRONG_GEN_PROT	9088
/* bad call of gentree module */
#define	WRONG_INDEX_ACCESS	9089
/* compile error:  input for index access not compatible (type or number) */
#define	WRONG_PATTERN2	9090
/* compile error:  error in pattern, escape specification needs length 1 */
#define	WRONG_PRECISION	9091
/* compile error:  wrong precision in type: %s */
#define	WRONG_SCALE	9092
/* compile error:  wrong scale specification: %s */
#define	WRONG_SCAN_PROT	9093
/* bad call of scanner */
#define	INTEGRITY_VIOL1	9094
/* compile error:  integrity violation in table %s;\nsee all violating tuples by running:\n%s\n%s */
#define	CONSTRUCT_MISMATCH	9095
/* compile error:  wrong number of constructor elements: %s */
#define	WRONG_SEPARATOR	9096
/* compile error:  wrong separator symbol in DATETIME/TIMESPAN literal: %s */
#define	RANGE_INDEX_EXP	9097
/* compile or cast error:  range symbol expected: %s */
#define	RANGE_MISMATCH	9098
/* compile error:  mismatch of DATETIME/TIMESPAN literal with range: %s */
#define	INVALID_RANGE	9099
/* compile or cast error:  illegal range of DATETIME/TIMESPAN: %s */
#define	CO_ECHO	9100
/* compile error:  %s */
#define	UNSOUND_SEARCH_CONDITION	9101
/* compile error: in line <%ld>:  illegal search condition in "%s" */
#define	ILLEGAL_NOT	9102
/* compile error:  operator 'NOT' requires a predicate */
#define	ILLEGAL_DYNPAR_CONST	9103
/* compile error:  cannot derive type of parameter %ld */
#define	ILLEGAL_FIELD_RANGE	9104
/* compile error:  illegal field range: %s */
#define	TYPE_EXPEC	9109
/* compile error:  type specification expected: %s */
#define	C_MISSING_ARRAY_SPEC	9110
/* compile error:  field '%s' needs an array specification, block %d, depth %d */
#define	C_WRONG_ARRAY_SPEC	9111
/* compile error:  field '%s' is not a multiple field, block %d, depth %d */
#define	C_RANGE_ARRAY_SPEC	9112
/* compile error:  range index '%d' too large for field '%s', block %d, depth %d */
#define	ILLEGAL_TYPED_PARAMETER	9113
/* compile error: typed parameter not allowed, use '?' notation: %s */
#define	ILLEGAL_PARAMETER	9114
/* compile error:  no parameters allowed %s */
#define	MIXED_PARAMETERS	9115
/* compile error:  illegal to mix dynamic and static parameters: %s */
#define	INSUPD1_CON_OF_TYPE	9116
/* compile error:  field mismatch in '%s': %d fields instead of %d  */
#define	INSUPD2_CON_OF_TYPE	9117
/* compile error:  type conflict in '%s': field position %d  */
#define	INSUPD3_CON_OF_TYPE	9118
/*  on field position %ld: cannot assign a '%s' to '%s' */
#define	ORB_OEB_TOK_EXP	9119
/* error in regular expression: '(', '[' or character expected at position %d */
#define	EOS_EXP	9120
/* error in regular expression: '\\0' expected at position %d */
#define	TOKEN_EXP	9121
/* error in regular expression: character expected at position %d */
#define	COMMA_EXP	9122
/* error in regular expression: ',' expected at position %d */
#define	CGB_EXP	9123
/* error in regular expression: '}' expected at position %d */
#define	CRB_EXP	9124
/* error in regular expression: ')' expected at position %d */
#define	OEB_EXP	9125
/* error in regular expression: '[' expected at position %d */
#define	TOKEN_CLASS_EXP	9126
/* error in regular expression: character or character range expected at position %d */
#define	QU1_NOT_FOUND	9127
/* compile error:  qualifier in '%s.%s' not valid in: block %ld, depth %ld */
#define	QU2_NOT_FOUND	9128
/* compile error:  qualifier in '%s.%s.%s' not valid in: block %ld, depth %ld */
#define	QU3_NOT_FOUND	9129
/* compile error:  qualifier in '%s' not usable in block %ld */
#define	ILLEGAL_SELFREFERENCE	9130
/* error: table to be modified is referenced in a subquery */
#define	TOO_MANY_ATTRIBUTES	9132
/* query result exceeds limit of fields */
#define	NO_POSI_FTEXT_INDEX	9133
/* compile error:  this fulltext phrase on field '%s' would need a positional fulltext index (only have a nonpositional) */
#define	BLOB_NAME_EXPECTED	9135
/* compile error: a blobname (identifier or stringconst) is expected : %s */
#define	UNKNOWN_BLOB_NAME	9136
/* compile error: unknown blobname in BLOB clause : %s */
#define	ILLEGAL_FULLTEXT_PREDICATE	9138
/* compile error:  illegal fulltext predicate (%s\n) : %s */
#define	ILLEGAL_MODIFICATION	9139
/* compile error:  illegal modification of a fulltext index: %s */
#define	ILLEGAL_BINCOMP_TYPE	9140
/* compile error:  illegal type for binary compatibility : %s */
#define	NO_FULLTEXT_INDEX	9141
/* compile error:  no fulltext index on field '%s' */
#define	DUPL_IN_NAME_LIST	9142
/* compile error:  duplicate in name list  */
#define	SYSTABLE_NAME_EXPEC	9143
/* compile error:  name of a system table expected : %s */
#define	IVUNISEC_TYPE_CONFLICT	9144
/* compile error:  input types for IVUNI/IVSEC do not match */
#define	ILL_REP_FAC	9145
/* error in regular expression: illegal repetition factor at position %d */
#define	INTEGRITY_VIOL2	9146
/* integrity violation: constraint '%s' on table '%s' violated */
#define	DUPLIC_IN_INDEX	9147
/* integrity violation: duplicate in index %s */
#define	NULL_ERROR	9148
/* integrity violation: insertion of tuple %ld into table '%s': NULL not allowed on Attribute '%ld' */
#define	NULL_ERROR_POS	9149
/* integrity violation: NULL not allowed on Attribute %ld of table '%s' */
#define	NULL_ERROR_VIEW	9150
/* integrity violation: NULL violation on base table '%s' via INSERT/SPOOL into view */
#define	REL_TUP_INS	9151
/* integrity violation: insertion of tuple %ld in table %s: probably duplicate of keys */
#define	NAT_UNI_USING_ON	9152
/* compile error:  NATURAL/UNION/CROSS JOIN do not allow USING or ON clause: %s */
#define	NO_NAT_UNI_NO_USING_ON	9153
/* compile error:  JOIN operator requires USING or ON clause: %s */
#define	ILL_IMPL_CORRESPONDING	9154
/* compile error:  CORRESPONDING on tables with no common field names : %s */
#define	DUPLICATE_FIELDNAME_CORR	9155
/* compile error:  duplicate fieldname on position %ld and %ld (%s) in %s operand of CORRESPONDING ..: %s */
#define	EXPLJOIN_NOTIN_FROMTOP	9156
/* compile error:  table expression with JOIN operator used in WHERE or SELECT clause; embed it in a "SELECT * FROM (..)": %s */
#define	FTXT_MISSING_ANY_CLAUSE	9157
/* compile error:  in line <%ld>: in CONTAINS, ANY clause missing for fulltext argument delivering set */
#define	CORR_NAME_ORDER	9158
/* NOTE that correlation names not allowed in ORDER BY - have been ignored - might be reason for error */
#define       UNKNOWN_BLOB_PARAM      9159
/* unknown blobname '%s' in BLOB parameter */
#define	ILLEGAL_RESULTCOUNT	9160
/* compile error:  'RESULTCOUNT' only allowed in outermost SELECT clause: %s */
#define       ILLEGAL_MERGE      9161
/* inconsistent MERGE node */
#define       SOFT_SY_FOPEN	9162
/* fopen(fn='%s', mode='%s') */
#define       DELIM_IN_FTXT_SEARCH	9163
/* an argument ('%s') for a fulltext index contains a delimiter at character position %ld */
#define	ILL_FTXT_INPUT_1	9164
/* Fulltext index creation: illegal NULL value in input table '%s' */
#define	ILL_FTXT_INPUT_2	9165
/* Fulltext index creation: in input table '%s', values in first field must have length 1 */
#define	ILL_FTXT_INPUT_3	9166
/* Fulltext index creation: in input table '%s', there is one of meta characters '%%', '_', '\' */
#define	ILL_FTXT_INPUT_4	9167
/* Fulltext index creation: in input table '%s', there is a delimiter inside word */
#define       DELIM_IN_CHARMAP	9168
/* %s value of charmap list (code %lu) is a delimiter */
#define       DELIMITER_NO_BLANK	9169
/* delimiter table must contain blank character (' ') */
#define       UD_SEQUENCE	9170
/* compile error:  undefined sequence '%s' */
#define	ILLEGAL_REL_NAME	9171
/* compile error:  '@@sys' is illegal prefix for a tablename: %s */
#define SURROGATE_NAME_EXPEC	9172
/* compile error:  field '%s' is not a compound surrogate in table '%s' */
#define CS_COMPONENT_NOT_NULL	9173
/* '%s' must be specified NOT NULL for surrogate use */
#define COMP_OR_REF_EXPEC	9174
/* compile error: 'COMPOUND' or 'REFERENCES' expected %s */
#define SIBLINGS_EXPEC	9175
/* compile error: 'SIBLINGS' expected %s */
#define SURR_EXPEC	9176
/* compile error: surrogate field expected %s */
#define UNEXP_SURR	9177
/* compile error: no surrogate field expected %s */
#define COMP_SURR_EXPEC	9178
/* compile error: compound surrogate field expected %s */
#define REF_SURR_EXPEC 9179
/* compile error: reference surrogate field expected %s */
#define UNEXP_COMP_SURR	9180
/* compile error: no compound surrogate field expected %s */
#define AMBIGUOUS_LEAF_LEVELS	9181
/* compile error: 2 surrogates have different leaf levels '%s' and '%s' */
#define LEAF_SURR_ONLY_KEY_REQUIRED	9182
/* compile error: leaf surrogate level '%s' must be only key attribute */
#define WRONG_REFCONSTRAINT1	9183
/* reference surrogate '%s' via local field '%s' : cannot determine a unique target table because there is more than one reference constraint coming out from '%s' */
#define WRONG_REFCONSTRAINT2a	9184
/* reference surrogate '%s' via local field '%s' : missing reference constraint on field '%s' to a target table */
#define WRONG_REFCONSTRAINT2b	9185
/* reference surrogate '%s' via local field '%s' : missing reference constraint from '%s' to table '%s'*/
#define WRONG_REFCONSTRAINT2c	9186
/* reference surrogate '%s' via local field '%s' : missing reference constraint from '%s' to table '%s', field '%s'*/
#define WRONG_REFCONSTRAINT3	9187
/* reference surrogate '%s' via local field '%s' : on referenced key '%s' in table '%s' there is no compound surrogate defined; cannot determine a surrogate field in target table '%s' */
#define WRONG_REFCONSTRAINT4	9188
/* reference surrogate '%s' via local field '%s' : on referenced key '%s' in table '%s' there are several compound surrogates defined; cannot determine a unique surrogate field in target table '%s' */
#define WRONG_REFCONSTRAINT5	9189
/* reference surrogate '%s' referring to field '%s' in table '%s' : cannot deduce a corresponding local field because there are several reference constraints from table '%s' to table '%s', field '%s' */
#define WRONG_REFCONSTRAINT6	9190
/* reference surrogate '%s' referring to field '%s' in table '%s' : cannot deduce a corresponding local field because there is no reference constraint from table '%s' to table '%s', field '%s' */
#define IDENTICAL_REFSURR_TNAMES        9191
/* identical tables for compound surrogate and reference surrogate not allowed */
#define ILLEGAL_INDEX_NAME	9192
/* compile error:  '@@sys' is illegal prefix for an index name: %s */
#define INVALID_IX_ON_SURR	9193
/* Surrogate not allowed user index attribute */
#define UNEXPECTED_NODE_SEQUENCE_UPDATE	9194
/* unexpected node sequence in update sequence */
#define SURR_IX_CONFUSION	9195
/* Surrogate index Confusion */
#define ILLEGAL_INPUT_FOR_CONCATENATION	9196
/* illegal input for concatenation operator - side %ld of 0/1 exhausted */
#define WRONG_REFCONSTRAINT7a	9197
/* reference integrity constraint to field '%s' of table '%s' must be specified with 'ON UPDATE CASCADE' because surrogate references must be maintained */
#define WRONG_REFCONSTRAINT7b	9198
/* reference integrity constraint going out from field '%s' of table '%s' must be specified with 'ON UPDATE CASCADE' because surrogate references must be maintained */
#define REF_SURR_CLUSTER_CONFLICT	9199
/* the target table of reference surrogate '%s' must not have a cluster number bigger (%ld) than that of the referencing table (%ld) */
#define SURROGATE_RESOLUTION_PROBLEM	9200
/* surrogate resolution for field '%s' failed - referenced table seems to be missing */
#define CS_LEVEL_TOO_LOW	9201
/* level for setCS too los */
#define SURR_UNIQUE_KEY_REQUIRED	9202
/* Unique key required for leaf level %s */
#define WRONG_REFCONSTRAINT8a	9203
/* reference integrity constraint to field '%s' of table '%s' must not be of type 'ON DELETE SET NULL/DEFAULT' because of dependent surrogate references */
#define WRONG_REFCONSTRAINT8b	9204
/* reference integrity constraint going out from field '%s' of table '%s' must not be of type 'ON DELETE SET NULL/DEFAULT' because of dependent surrogate references */
#define REF_SURR_REDUNDANT	9205
/* in table '%s' the reference surrogates '%s' and '%s' both refer to the same field '%s' */
#define INDEX_NOT_REMOVABLE	9206
/* system generated index '%s' not removable */
#define	USER_SURROGATE_UPDATE	9207
/* compile error:  illegal update on surrogate field %s */
#define	WRONG_SURR_POSITION	9208
/* compile error:  in table '%s' surrogates are not specified as last fields */
#define COMP_SURR_NOT_FOUND	9209
/* Compound Surrogate could not be found */
#define WRONG_REF_SURR_COMP_MODE	9210
/* Invalid Reference Surrogate computation mode (mode=%d) */
#define DXCS_INDEX_NOT_FOUND	9211
/* DXcs index not found */
#define WRONG_CS2IVAL_SPEC 9212
/* wrong cs2ival input */
#define DXH_INDEX_NOT_FOUND	9213
/* DXH index not found (tname='%s', cspos=%ld') */
#define	ILLEGAL_ODBC_ESCAPE_SEQUENCE	9214
/* compile error:  illegal odbc syntax: %s */
#define	ILLEGAL_STATEMENT_FOR_TRIGGER	9215
/* compile error:  illegal statement for trigger: %s */
#define	ILLEGAL_CORRIDS_FOR_TRIGGER	9216
/* compile error:  illegal correlation specification for trigger: %s */
#define	ILLEGAL_NEW_FOR_TRIGGER	9217
/* compile error:  For delete trigger no NEW specification allowed: %s */
#define	ILLEGAL_OLD_FOR_TRIGGER	9218
/* compile error:  For insert trigger no OLD specification allowed: %s */
#define TRIGGERNAME_EXPEC	9219
/* compile error:  trigger name expected: %s */
#define	TRIGGER_NOT_FOUND	9220
/* trigger '%s' does not exist */
#define TRIGGER_EXISTS		9221
/* cannot create because trigger '%s' already exists */
#define ERR_IN_TRIGGER_COND	9222
/* in trigger search condition */
#define ERR_IN_TRIGGER_ACTION 9223
/* in trigger '%s' (action no. %ld) */
#define TRIGGERS_ON_BASETABLES 9224
/* triggers can only be created on basetables */
#define PARAM_IN_STATEMENT_TRIGGER 9225
/* statement triggers cannot contain NEW/OLD parameter */
#define DUPLICATE_HIER_PATH	9300
/* Attempt to insert already existing hierarchy path */
#define SET_CS_CONFUSION	9301
/* confusion!! setting bits for compound surrogate failed */
#define WRONG_BITMAP_OPERATION	9302
/* wrong bitmap operation %d */
#define FANOUT_OVERFLOW		9303
/* fanout overflow - too many tuples inserted; cs='%s', lev_pp=%d */
#define XCS_CONFUSION		9304
/* confusion when computing surrogate from Xcs index */
#define CONFUSION_CS_LOOKUP	9307
/* Confusion!! cs lookup must find h1 */
#define HASH_TUPNR_NOT_SPECIFIED	9500
/* Either hfct_size or tupnr must be specified */
#define HASH_NOT_SUPPORTED_TYPE	9501
/* Not supported datatype for Hash function */
#define TOO_MANY_KEY_ATT	9502
/* Too many key attributes for hash function */
#define HSCAN_OVERFLOW	9503
/* Too many open hash scan IDs */
#define INVALID_HASH_ID	9504
/* invalid hash ID */
#define HASH_OBJ_NOT_FOUND	9505
/* no object in hash table for hash value %d */
#define HASH_TAB_OVERFLOW	9506
/* cannot allocate space for new hash tables */
#define CACHE_OVERFLOW	9507
/* cannot allocate space for hash table (cache size too small) */
#define FORCED_HASH_NOT_POSSIBLE	9508
/* could not store reference surrogates in hash table (not enough heap space) */
#define INVALID_HASH_KEY_ARITY  9509
/* wrong arity of hash key: arity=%d */  
#define WRONG_TUPLE_ARITY	9510
/* wrong arity of tuple: arity=%d */
#define INVALID_HASH_DELETE_MODE	9511
/* wrong hash_delete mode: specify either key or hscan */
#define WRONG_HASH_ID	9512
/* hash id out of range */
#define HASH_VALUE_ILLEGAL	9513
/* Invalid hash value: == 0 */
#define TBC_WRONG_COMPOUND_SURROGATES	9600
/* wrong comopund surrogate */
#define TBC_CS_HIER_CONSISTENCY	9601
/* Inconsistency between compound surrogate and hierarchy */
#define TBC_CS_INDEX_NOT_FOUND	9602
/* could not find corresponding index for compound surrogate */
#define TBC_INVALID_INDEX_TYPE	9603
/* invalid index type for surrogate index */
#define	ERR_CODEPAGE_VAL	9700
/* compile error:  syntax error in codepage specification:  %s */
#define	ERR_PROLOGUE_VAL	9701
/* compile error:  syntax error in prologue specification:  %s */
#define	ERR_PROLOGUE_COMPAT	9702
/* prologue specification is valid for UCS2 and UTF8 only:  %s */
#define	ERR_CODEPAGE_COMPAT1	9703
/* code conversion from '%s' to '%s'  is not available */
#define	INVALID_PROLOGUE	9704
/* invalid prologue sequence found. Couldn't be recognized */
#define	CODEPAGE_MISMATCH	9705
/* codepage and prologue sequence do not match: sql='%s', prologue='%s' */
#define	INVALID_CODE_SEQUENCE	9706
/* invalid %s-coding found */
#define	CODEPAGE_MISMATCH2	9707
/* codepage retrieved from Block0 '%s' does not match '%s' */
#define	CODE_SEQUENCE_REPLACED	9708
/* invalid codesequences have been repleced by '?' for rownumbers: %s */
#define	INVALID_CODE_SEQUENCE_TERMINATE	9709
/* please check your locale settings */
#define	INCONSISTENCY_IN_FTXT_BUFFER	9710
/* inconsistency in fulltext buffer ( code = %ld ) */
#define	CODEPAGE_NOT_FOUND	9711
/* codepage not found */
#define	CODEPAGE_NOT_FOUND2	9712
/* No codepage has been found in romfile. Please specify interactively */
#define	CODEPAGE_MISMATCH3	9713
/* romfiles have mixed codepage specifications */
#define	CODEPAGE_NOT_FOUND_MIGRATION	9714
/* specify a CODEPAGE in tbdesc (e.g. "CODEPAGE=Propriet") */
#define	UNEXP_REMOTE_SEGID	9715
/* compile error: unexpected segid was found in a remote table:  %s */
#define	DBNAME_EXPEC	9717
/* compile error: database name expected for remote table:  %s */
#define	DBHOST_EXPEC	9718
/* compile error: database host expected for remote table:  %s */
#define ENCRYPT_MISMATCH1	9719
/* definition for encryptionmode different in 'dbconf.ini' (='%c') and 'block0' (='%c') */
#define ENCRYPT_MISMATCH2	9720
/* no valid encryption mode detected neither in database configuration nor in Block0 */
#define CHECK_ENCRYPTION	9721
/* no valid encryption mode detected in Block0 */
#define	MULTIDB_IN_DELETE_OR_UPDATE 9722
/* compile error: only one DB can participate in an update or delete */
#define	REMOTE_VIEW 9723
/* compile error: cannot define views on a remote table: %s */
#define	REMOTE_BLOB 9724
/* compile error: cannot access Blobs in a remote table */
#define INVALID_CODE_CONVERSION 9725
/* cannot map %s-coding to %s */
#define REMOTE_SPOOL_BLOB_CLIENTVERS 9726
/* cannot get blob from remote database. Please upgrade your client software */
#define	NAME_EX	600
/* a tree with name >>%s<< already exists */
#define	NO_CAT	601
/* there is no C_BSTAR catalog in segment %d */
#define	TIMESPAN_OVERFLOW	21001
/* overflow in TIMESPAN arithmetic */
#define	DT_INVALID_RANGE	21002
/* invalid range in DATETIME/TIMESPAN */
#define	RANGE_CONFLICT	21003
/* wrong range combination */
#define	INVALID_DATETIME	21004
/* invalid DATETIME value: %s */
#define	INVALID_TIMESPAN	21005
/* invalid TIMESPAN value: %s */
#define	SELECTOR_RANGE	21006
/* selector not in range of DATETIME/TIMESPAN value */
#define	CONFLICTING_SIGN	21007
/* conflicting signs in components of timespan CONSTRUCTion */
#define	HYPERCUBE_RANGE_OVERFLOW	21008
/* cannot create hypercube index on such fine granularity of Datetime/Timespan */
#define	E_UNDEF_TYPE	10014
/* Type >%d< not implemented */
#define	SY_ACCEPT	1800
/* accept() */
#define	SY_CHDIR	1801
/* chdir(dir='%s') */
#define	SY_FILENAME	1802
/* %s */
#define	SY_CLOSE	1804
/* close(fd=%d) */
#define	SY_CONNECT	1805
/* connect(sock=%d) */
#define	SY_DIR	1806
/* opendir(dir='%s') */
#define	SY_FCLOSE	1809
/* fclose() */
#define	SY_FREAD	1810
/* fread() */
#define	SY_FOPEN	1811
/* fopen(fn='%s', mode='%s') */
#define	SY_FORK	1812
/* fork() or vfork() */
#define	SY_FWRITE	1813
/* fwrite() */
#define	SY_LISTEN	1814
/* listen(sock=%d) */
#define	SY_MALLOC	1815
/* malloc(s=%d) */
#define	SY_MKDIR	1816
/* mkdir(dir='%s') */
#define	FFILE_ERROR	1817
/* buffered stream I/O '%s' on file '%s' encountered error (errno=%d) */
#define	SY_OPEN	1818
/* open(fn='%s', mode=%o) */
#define	SY_PIPE	1819
/* pipe() */
#define	SY_PSEMA	1820
/* os_psema(semid=%d, semano=%d) */
#define	SY_READ	1821
/* read(fd=%d) */
#define	SY_RMDIR	1823
/* rmdir(dir='%s') */
#define	SY_SEEK	1824
/* seek(fd=%d) */
#define	SY_SEMDEL	1826
/* os_rm_sem(semid=%d) */
#define	SY_SEMGET	1827
/* os_get_sem(key=0x%x) */
#define	SY_SEMINIT	1828
/* os_ini_sem(semid=%d) */
#define	SY_SOCKET	1829
/* socket() */
#define	SY_SOCKOPT	1830
/* setsockopt() */
#define	SY_STAT	1831
/* stat(fn='%s') */
#define SY_RENAME	1832
/* rename(from=%s, to=%s) */
#define SY_COPY	1833
/* copy(from=%s, to=%s) */
#define	SY_UNLINK	1834
/* unlink(path='%s') */
#define	SY_VSEMA	1835
/* os_vsema(semid=%d, semano=%d) */
#define	SY_WRITE	1836
/* write(fd=%d) */
#define	SY_SEMINFO	1837
/* os_seminfo(semid=%d) */
#define	SY_SEMCHECK	1838
/* os_chk_sem(semid=%d) */
#define	SY_SHMAT	1839
/* os_at_mem(shmid=%d) */
#define	SY_SHMGET	1840
/* os_get_mem(key=0x%x) */
#define	SY_SHMINIT	1841
/* os_ini_mem(shmid=%d) */
#define	SY_SHMINFO	1842
/* os_inf_mem(shmid=%d) */
#define	SY_SHMDT	1843
/* os_dt_mem(shmid=%d) */
#define	SY_SHMDEL	1844
/* os_rm_mem(shmid=%d) */
#define	TFREAD		1845
/* tf_read : could read %ld bytes, wanted  %ld */
#define	TFWRITE		1846
/* tf_write : could write %ld bytes, wanted  %ld */
#define	SY_SIGNAL     1847
/* os_send_signal(pid=%ld) */
#define SY_FPRINTF	1848
/* fprintf() */
#define SY_FFLUSH	1849
/* fflush() */
#define SY_TEMPNAM	1850
/* os_tempnam() */
#define SY_PUTC		1851
/* putc() */
#define SY_SELECT	1852
/* select() */
#define SY_SHUTDOWN	1853
/* shutdown() */
#define SY_TIME		1854
/* os_get_time() */
#define	USAGE_TAPE_FOPEN	1860
/* tape filedescriptor occupied or wrong mode */
#define	BLOCKDEV_WRITE	1861
/* writing to blockdevice not possible */
#define	BLOCKDEV_CHANGE	1862
/* changing to blockdevice not possible */
#define	NOT_TBTAPE_VOLUME	1863
/* not a tbtape volume */
#define	READ_TBTAPE	1864
/* could not read from a tbtape volume */
#define	WRITE_TBTAPE	1865
/* could not write to a tbtape volume */
#define	TBTAPE_SEQUENCE	1866
/* %s found on tape; wrong sequence */
#define	TBTAPE_PHASE	1867
/* out of phase on tbtape; try -c option */
#define	TERMINAL_IN	1868
/* out of phase on tbtape; try -c option */
#define	NO_DIGIT	1902
/* syntax error in fixpoint conversion */
#define	TB_KILLED	1903
/* Transbase on database <%s@%s> has been killed */
#define	BLF_FORMAT	1904
/* Format Error in Blob-source file %s */
#define UNDEF_EVENT     2001
/* Account-Event %ld is not realized */
#define	UNKNOWN_HOST	10036
/* Unknown host %s */
#define	UNKNOWN_TARECORD	10037
/* TA is unknown by logg-server */
#define	UNKNOWN_SERVER	10038
/* Couldn't query for service on server  %s */
#define	AT_TROUBLE	11000
/* I have trouble with aborting TA %ld, state is <undefined> */
#define	CANNOT_RECEIVE	11001
/* Cannot receive on fd %d */
#define	CANNOT_SEND	11002
/* Cannot send on fd %d */
#define	CT_TROUBLE	11004
/* I have trouble with committing TA %ld, state is <%s> */
#define	DAMAGED_FILE	11005
/* Damaged file <%s>, will restore it from <%s> */
#define	DB_EXISTS	11006
/* %s <%s> already exists */
#define	DB_NOT_BOOTED	11007
/* database <%s@%s> is not booted */
#define	DB_NOT_INIT	11008
/* database <%s@%s> is not initialized */
#define	DISTR_LOCK	11009
/* Cannot distribute Transaction */
#define	ILL_CONS_LEVEL	11010
/* illegal value for consistency has been specified */
#define	ILL_DB_ID	11011
/* Illegal db_id %d */
#define	ILL_REQ	11012
/* Illegal request %d */
#define	INVAL_REMOTE	11013
/* invalid access from an unknown Host */
#define	MU_LOCK	11014
/* Cannot login on Multiuser Database,\n   Logserver is obviously not running */
#define	NOPERM	11015
/* you are not allowed to %s %s */
#define	NOT_MU	11016
/* <%s@%s> is not a multiuser %s */
#define	DB_LIMIT_REACHED 11017
/* Only one database allowed per machine */
#define	NO_PORT_VACANT	11018
/* All ports in use */
#define	NO_SPACE	11019
/* Cannot allocate heap memory */
#define	OUT_TA_ONLY	11020
/* this request is allowed only outside transactions */
#define	PORT_OCC	11021
/* port for service <%s> is occupied, server already  active? */
#define	SERVER_KILLED	11022
/* server at <%s> has been killed */
#define	SERVER_NOT_ACTIVE	11023
/* server <%s> at <%s> not reachable */
#define	ILLEGAL_REPLACE_TIMES	11024
/* illegal (negative) value for replacement count */
#define	STR_TOO_LONG	11025
/* String <%.20s ...> exceeds limit of %d bytes */
#define	SYS_CRASH	11026
/* Transaction %d had been killed by transbase-crash, abort it */
#define	TA_OPEN	11027
/* Transaction %ld is open on database %d */
#define	TBX_ACTIVE	11028
/* tbx is already active */
#define	TBX_AT	11029
/* Transaction %ld aborted by tbx */
#define	TIMED_OUT	11030
/* Connection timed out */
#define	TOO_MANY_DBS	11031
/* Too many connected databases */
#define	TOO_MANY_QU	11032
/* Too many queries open */
#define	TOO_MANY_TAS	11033
/* Too many transactions open */
#define	UNDEF_SERV	11034
/* Undefined service %s, protocol %s */
#define	UNKNOWN_DATABASE	11035
/* %s <%s@%s> does not exist */
#define	SUBQUERY_DEL_SET	11036
/* subquery delivers a set instead of single element */
#define	SUBRANGE_FAULT	11037
/* illegal range values for a SUBSTRING/SUBRANGE operator */
#define	ILLEGAL_FLUSH  11038
/* %s <%s@%s> is not a CD-ROM System,\ncannot flush */
#define	STOPWORD_IN_FTXTARG	11039
/* use of a stopword ('%s') is illegal in a fulltext search argument */
#define	ILLEGAL_FINDBIT_SPECI	11040
/* operand for 'FINDBIT' must be greater equal 0 */
#define	ILLEGAL_BITPOS	11041
/* illegal bit position %ld  */
#define NO_SERIAL_NUMBER	11042
/* No serial number found in Program.\nLook into your Transbase Installation Guide for more information */
#define STRLIB_ERROR		11043
/* Error %ld found in DLL Library: %s */
#define	LICENCE_DB_TYPE	11044
/* licence violation: illegal database type */
#define INVALID_SERIAL_NUMBER	11045
/* %s */
#define NO_MYRIAD_LICENSE	11046
/* This Server cannot be used for Myriad, insufficient License */
#define ILL_PATHSPEC		11047
/* Invalid path specification, must be absolute directory path */
#define NO_MYRIAD_ARCHIVE	11048
/* %s is not a Myriad Archive */
#define DLL_ALREADY_IN_USE	11049
/* The DLL '%s' is already used by task '%s' */
#define WIN_NOT_AVAIL		11050
/* This functionality is not available with MS Windows */
#define TOO_MANY_TASKS		11051
/* Too many other tasks are active */
#define ILLEGAL_SERVICE_ENV	11052
/* Environmentvariable %s has wrong syntax: >%s< \nExample: >tbk41:tbs41<*/
#define INIERROR		11053
/* Couldn't find Key '%s' in INI files */
#define DLLLOAD			11054
/* Couldn't load DLL %s */
#define FUNCTIONLOAD			11055
/* Couldn't find function %s in DLL %s */
#define NO_NETACCESS		11056
/* Transbase is not configured for remote access */
#define WRONG_COMM_PROTOCOL		11057
/* wrong protocol for %ld. Please finish previous %ld call */
#define BROADCAST_NOT_ALLOWED		11058
/* Illegal request %ld or broadcasting is not allowd for this request */
#define UNKNOWN_CONTEXT			11059
/* Unknown contextid %ld */
#define KERNEL_TIMEDOUT			11060
/* request for database %s has timed out after %ld seconds */
#define CONTEXT_NOT_SAVE		11061
/* Kernel must switch context, but previous context is not saved */
#define APPLICATIONS_ACTIVE		11062
/* Applications are still active on databases, cannot stop */
#define UNIQ_NAME_NOT_FOUND	11063
/* no unique tablename with prefix %s has been found */
#define	ILLEGAL_COMPRESS_SPEC  11064
/* romfile number specification (%ld) greater than maximum existing cluster in database (%ld) */
#define	CHARREPLACE_FAULT1  11065
/* REPLACE,CHARS operation has first and second operand with different lengths  */
#define	ILLEGAL_REPLICATE_TIMES	11067
/* illegal (negative) value for REPLICATE count or search string empty */
#define	MPLX_ILL_REQ	11068
/* Multiplexer received illegal connect request. Probably version conflict  */
#define	KERNEL_ILL_REQ  11069
/* Kernel received illegal request. Probably version conflict  */
#define NO_FULLTEXT_LICENSE	11070
/* This Server cannot be used for fulltext SQL: insufficient License */
#define FUNC_N_AVAIL	11071
/* This functionality is not available: %s */
#define SY_ADVSERVICE	11072
/* Couldn't advertise Service %s */
#define COULD_NOT_QUERY_NAME 11073
/* The process could not find it's name in the INI file. Please set SERVERNAME switch */
#define CD_RETR_COMPR_FLUSH	11074
/* %s <%s@%s> is a compressed CD-ROM System,\ncan flush it only in mode 'incremental'*/
#define EDITORIAL_INCR_FLUSH	11075
/* %s <%s@%s> is a editorial database,\ncannot flush it in mode 'incremental'*/
#define INCR_RETR_INCR_FLUSH	11076
/* %s <%s@%s> has already been flushed in incremental mode - \ncannot flush it again */
#define CLIENTVERSION_MISMATCH	11077
/* the version of the client is to old for using this feature: %s*/
#define FILEREF_NEEDS_FILENAME	11078
/* the get fileref operation needs a filename */
#define	TBXVAR_CORRUPTED	11079
/* Local variables corrupted, TBX stopped */
#define	SEQUENCE_OVERFLOW	11080
/* Sequence '%s' has overflowed with value %ld */
#define	SEQUENCE_EMPTY	11081
/* Sequence '%s' unexpectedly is empty - no tuple found */
#define	SEQUENCE_NOT_INITIALIZED	11082
/* Sequence %s has not yet received a "nextval" , "currval" undefined */
#define	ILLEGAL_COMPFILE	11083
/* romfile '%s' contains a corrupted or illegal compfile (page type %ld) */
#define	INVALID_CODING_SPEC  11084
/* invalid coding specification <%s> has been found in database descriptionfile */
#define	INVALID_LOCALE_SPEC  11085
/* invalid locale specification <%s>. Not available on this machine */
#define EXTENT_OVERFLOW	11086
/* extent %ld in cluster %ld has reached file size limit in flush operation (incremental=%ld, editorial=%ld) */
#define DELTA_OVERFLOW	11087
/* an incremental flush produces a delta romfile larger than the file size limit (cluster=%ld, extent=%ld) */
#define NO_TRANSBASE_D_LICENSE	11088
/* License does not have TransbaseD capability.\nPlease contact your software vendor for an upgrade. */
#define NO_TRANSBASE_D_AVAIL	11089
/* TransbaseD functionality is disabled.\nPlease contact your software vendor for further information. */
#define ILLEGAL_CONTENTS_IN_SEQUENCE	11090
/* Unexpected tuple in sequence '%s'*/
#define CONTEXT_DELETED			1107
/* Context has been deleted caused by a system problem */
#define INACTIVITY_TIMEOUT		1106
/* inactivity timeout after %ld seconds */
#define	FILE_NOT_FOUND	2102
/* error:  cannot open file %s */
#define	IK_IN_INDEX	2104
/* confusion in index  %s */
#define	NO_INDEX_TUP	2105
/* can't find tuple in index %s */
#define	NO_TUPLE_DELIVERED	2106
/* subquery does not deliver a tuple */
#define	REL_IK_DEL	2110
/* can't delete tuple in table %s by IK value: %d-th tuple */
#define	OBS_REL_TUP_INS	obs2111
/* obsolete: placeholder for avoiding the reuse of code 2111 */
#define	REL_TUP_UPD	2112
/* can't update tuple %ld in table %s: duplicate of keys */
#define	REL_KEY_DEL	2113
/* can't delete tuple in table %s by key value: %d-th tuple */
#define	WRONG_PATTERN	2114
/* error in pattern `%s', escape char `%c' */
#define	WRONG_QUERY_TYPE	2115
/* wrong query type in ipreter */
#define	WRONG_RESET_CALL	2116
/* error in interpreter, wrong reset propagation */
#define	EMPTY_AUTOMATON	2117
/* no automaton */
#define	UNEXPECTED_TREE_PATTERN	2118
/* unexpected tree pattern: %s */
#define	ILLEGAL_FUNC_ADDR	2119
/* illegal address 0x%s for user defined function */
#define	WRONG_BLOBFILE_ID	2120
/* wrong blobfile id for inserting/fetching a BLOB */
#define	BLOB_READ_ERROR		2121
/* could not read BLOB object */
#define	BLOB_DELETE_ERROR	2122
/* could not delete BLOB object; wrong blob address */
#define	BLCKED_PROC	2400
/* Lock Manager tried to undo a blocked process */
#define	LM_CONFUSION	2401
/* Confusion in LCKMAN (%s %ld %ld %ld %ld %ld);\n Please contact Transbase Team ! */
#define	LM_NOSPACE	2402
/* Lock Manager out of space (%ld %ld %ld %ld %ld) */
#define	LM_NOTSRT	2403
/* Lock Manager got unsorted lock-list */
#define	UNDEF_ID	2404
/* Lock Manager got undefined Id (%ld) */
#define	UNSOUND_LCKRQ	2405
/* Lock Manager got inconsistent lock/unlock_request */
#define	UNSOUND_PID	2406
/* Lock Manager got wrong process-id for that request */
#define	UNSOUND_TMSTMP	2407
/* Lock Manager got different timestamps for that ta */
#define	WRONG_TASTATE	2408
/* Ta (%ld) has wrong state (%ld) for this request */
#define	ICSQL_UNDEF_FUNC	2409
/* Call of function %s not allowed in ICSQL-version */
#define	LSID_OVFL	2410
/* Too much open locksets per ta (%d) */
#define MLE_CONFUSION1	2411
/* %s can't find segno in Run_lock tables (%ld %ld) */
#define MLE_CONFUSION2	2412
/* %s got unsound parameters (%ld %ld %ld %ld) */
#define	LM_DB_LOCKED	2414
/* Database <%s@%s> is locked because distributed TA can't be finished:\nserver at <%s> not reachable */
#define LOCKINFO_FAULT	2416
/* %s got unsound lockinfo (%ld %ld %ld %ld %ld) */
#define	HARD_NO_FREE_TMSTMP	2417
/* can not find free Dynamic-Timestamp - must abort */
#define	HARD_LOCKS_NOT_GRANTABLE	2418
/* query rejected: TA conflict with object(s)%s%s%s%s%s%s%s%s%s%s - must abort */
#define	HARD_LOCK_TIMEOUT	2420
/* query timed out on blocked object(s)%s%s%s%s%s%s%s%s%s%s - must abort */
#define	HARD_QUERY_CONFLICT	2422
/* query conflict: illegal parallel reading and writing object(s)%s%s%s%s%s%s%s%s%s%s - must abort */
#define	HARD_REL_TUP_INS	2423
/* integrity violation: insertion of tuple %ld in table %s: probably duplicate of keys */
#define	TREE_NOT_ANALYSED	2701
/* can't construct prest-predicate without pfirst */
#define	WRONG_NODE_FTEXT_IN_TREE	2702
/* wrong_node_ftext_in_tree */
#define	ILLEGAL_JOIN_ALGORITHM	2703
/* wrong combination of outerjoin and specified join algorithm */
#define	UNSOUND_HDG_PARAMS	2704
/* unsound hdg parameters: hdg=%ld, cspos=%ld */
#define	AFFECTED_PAGES	15999
/* affected page(s)%s%s%s%s%s%s%s%s%s%s */
#define	DB_NEED_ALIGN	16000
/* database needs alignment */
#define	ILLEGAL_CURRENT	16001
/* illegal CURRENT-clause */
#define	LOCKS_NOT_GRANTABLE	16002
/* query rejected: TA conflict with object(s) %s %s %s %s %s %s %s %s %s %s */
#define	LOCK_TIMEOUT	16003
/* query timed out: blocked object(s) %s %s %s %s %s %s %s %s %s %s */
#define	LOGIN_FAILED	16004
/* login failed: wrong password or access not allowed for user %s */
#define	NOT_LOGGED	16005
/* you are not logged in */
#define	NOT_ON_ROW	16006
/* cursor is not on a row */
#define	NO_UPD_POS_STAT	16007
/* update positioned required: %s */
#define	NO_UPD_SELECT	16008
/* modification refers to a not updatable query */
#define	OBJ_ACTIVE	16009
/* illegal to unlock an object which is being worked upon */
#define	OBJ_NOT_LOCKED	16010
/* illegal to unlock an object with no lock */
#define	OBJ_WR_LOCKED	16011
/* one of the table(s) or basetable(s) of view(s) has update lock: cannot unlock */
#define	QUERY_CONFLICT	16012
/* query conflict: illegal parallel reading and writing object(s) %s %s %s %s %s %s %s %s %s %s */
#define	QU_NOT_OPEN	16013
/* query_id %d belongs to not opened query */
#define	TOO_MANY_OBJECTS	16014
/*  too many tables/views */
#define	NO_FREE_TMSTMP	16015
/* can not find free Dynamic-Timestamp */
#define	WRONG_RELATION	16016
/* update positioned refers to wrong table: %s */
#define	PARNO_MISMATCH	16017
/* number of parameters does not match (got %d, wanted %d)*/
#define	PARTYPE_MISMATCH	16018
/* type of parameter %d does not match (got %s, wanted %s) */
#define	NO_DEL_POS_STAT	16019
/* delete positioned required: %s */
#define	STMTID_ACTIVE	16020
/* Stored Queryid %d is active */
#define	BLOBNAME_OCCUPIED	16021
/* blobname %s is already occupied */
#define	ILLEGAL_BLOB_ADDRESS	16022
/* illegal blob address in blfmanager */
#define COMMIT_TIMEOUT		16023
/* commit timed out: must wait for reading transactions to finish */
#define	LICENSE_NOT_SUFFICIENT	16024
/* License ist not sufficient to connect a %ld user database or wrong program */
#define	SYNTAX_ERROR_CONTEXT_FILE	16025
/* illegal contents in context file %s */
#define	STMT_MISMATCH_CONTEXT_FILE	16026
/* mismatch of number of stored queries: %ld != %ld , for context # %ld */
#define	CONTROL_ERROR_CONTEXT_FILE	16027
/* error in redundance check in context file %s */
#define	CRYPT_INCOMPAT	16028
/* Incompatibilty between crypt algorythms detected.\nPlease consult Transaction Software */
#define	QUERY_NOT_STORABLE	16029
/* Query not storable (named BLOB's) */
#define	MU_NOT_CAPABLE	16030
/* This software is not able to attach to a multi user database */
#define       LICENCE_HCTREE  16031
/* Insufficient licence to work upon HyperCube Trees */
#define	SHM_64K_PROBLEM	16032
/* shared memory allocation > 64K. Please reconfigure the database */
#define       LICENCE_POLYGON  16033
/* Insufficient licence for polygon functionality */
#define	LICENSE_NOT_SUFFICIENT_CPUS	16034
/* License ist not sufficient to run on a %ld cpu platform */
#define	IBB_CONTENTION	3601
/* illegal transaction parallelism on IBB disk cache manager - must abort */
#define	CLOSE_FAULT	3602
/* the OS cannot close file %s, errno %d */
#define	CONSISTENCY_SEGMAN	3603
/* consistency error %d in segman */
#define	CREAT_FAULT	3604
/* the OS cannot create file %s, errno=%d */
#define	EXPIRED	3605
/* Transbase has expired. Consult Transaction Software */
#define	WRONG_PAGESIZE	3606
/* wrong pagesize %d delivered */
#define	FIXCNT_UNDERFLOW	3607
/* fixcnt underflow on cached page <%s,%lu>,  TA <%ld, pid %ld> */
#define	FIX_FAULT	3608
/* closing seg %s, TA <%ld, pid %ld> has left %d pages fixed */
#define	HEAP_ERROR	3609
/* segment manager confuses heap; you can work on, however */
#define	ILL_PG_DEL	3610
/* page <%s,%lu> in wrong state for deletion, TA <%ld, pid %ld> */
#define	CHECKSUM_ERROR	3611
/* checksum error in block %lu , device '%s', pagesize %ld  */
#define	LOCKMAN_FAULT1	3612
/* synchronization error detected in segman */
#define	FLUSH_ROMFILE_NOT_EXISTS	3613
/* cannot flush CD-RETRIEVAL database because target romfile for cluster %ld does not exist */
#define	WRONG_PAGE_FLUSH_SEQUENCE	3614
/* page sequence in flushing: expected %ld, saw %ld */
#define	NO_SPACE_IN_FREEFIX	3615
/* fix list in segment manager too small */
#define	NO_SPACE_IN_SHARED_MEMORY	3616
/* segment manager out of space */
#define	OPEN_FAULT	3617
/* OS can't open file %s, errno %d */
#define	CLUSTER_VIOLATION	3618
/* page %ld in segment %ld out of cluster boundaries [ %ld , %ld ] */
#define	PG_NOT_EXISTS	3619
/* for segment %s: on device '%s' block %lu does not exist, TA <%ld, pid %ld>  */
#define	FLUSH_ROMFILE_EXISTS	3620
/* cannot flush database because target romfile for cluster %ld exists */
#define	RD_FAULT	3621
/* the OS cannot read block %lu, device '%s', errno %d, ret %d len %d*/
#define	WR_FAULT	3622
/* the OS cannot write block %lu, device '%s', errno %d ret %d len %d*/
#define	RD_FAULT2	3623
/* the OS cannot read from file %s, errno %d */
#define	RD_FAULT3	3624
/* the OS cannot read from file %s, offset %ld, len %ld, errno %d */
#define	WR_FAULT2	3625
/* the OS cannot write to file %s, offset %ld, len %ld, errno %d */
#define	SEG_DEL_FAULT	3626
/*  can't delete segment %s: opened more than once, TA <%ld, pid %ld>  */
#define	SEG_NOT_OPEN	3627
/* Illegal operation on closed segment %s */
#define	SYNC_FAULT	3628
/* the OS can't sync file %s, device '%s', errno %d */
#define	TA_ALREADY_ACTIVE	3629
/* Mta_id in begin_transaction already known */
#define	TA_COUNTER_OVERFLOW	3630
/* too many transactions in database life cycle */
#define	TA_NOT_FOUND	3631
/* unknown TA in segment manager */
#define	UNFIXED_PAGE	3632
/* fixcnt underflow on page <%s,%lu>,  TA <%ld, pid %ld> */
#define	UNLINK_FAULT	3633
/* the OS cannot delete file %s, errno %d */
#define	PAGE_CORRUPTED	3634
/* Panic in segman: page header <%s,%lu> inconsistent with catalog entry <%s,%lu>: I finish all processes */
#define	WRONG_SEGMAN_PROT	3635
/* bad initialization of segment manager */
#define	ILLEGAL_SYSSEG_OP	3636
/* illegal operation on a system segment */
#define	WRONG_TA_STATE	3637
/* wrong transaction protocol in segment manager */
#define	RENAME_FAULT	3638
/* the OS cannot rename file '%s' to '%s', errno %d */
#define	ILLEGAL_CACHESIZE	3639
/* size of cache partition is not power of 2 (%ld) */
#define	ILLEGAL_LINEAR_SEG_OP	3640
/* illegal delete operation on a linear segment */
#define	LOCAL_CACHE_FULL	3641
/* no buffers available in local cache: increasing "Sorter Cache Size" could help */
#define	GLOBAL_CACHE_FULL	3642
/* no buffers available in cache: increasing "Number of Caches" could help */
#define	ALIGNMENT_PROBLEMS	3643
/* page definitions did not match with pagesize */
#define	WRONG_BLOCKCOUNT	3644
/* blockcount too large */
#define	DB_DEVICE_FULL	3645
/* no space on %s device for a %s block; in case of device DISK, you can extend database by a new volume */
#define	ILLEGAL_OP_SYS_TA	3646
/* illegal operation for system transaction */
#define	BLOCK_FREE_ERROR	3647
/* fsm error: unexpected bit in fsm leaf */
#define	AUX_BUF_TOO_SMALL	3648
/* fsm error: auxiliary buffer for init_db too small */
#define	ILLEGAL_USERSEG_OP	3649
/* illegal operation on a user segment */
#define	TOO_MANY_TA	3650
/* Too many parallel transactions required */
#define	BLOCK0_OVERFLOW	3651
/* too many transactions for block0 */
#define	LOCSEGS_LEFT	3652
/* a LOCAL segment is left over */
#define	ILLEGAL_SEGTYPE	3653
/* an operation with wrong input segment type has occurred */
#define	UNEXPECTED_PAGE_TYPE  3654
/* segman: got page type %ld, expected %ld */
#define	UNEXPECTED_PTYPE	3655
/* unexpected ptype %ld in conversion routine */
#define	NO_FD	3656
/* no file descriptor when reading a scratch container */
#define	CLUSTER_NOT_FOUND	3657
/* cluster not found via cluster# %ld or block# %ld */
#define	BLOCK_OCCUPIED	3658
/* on device '%s', the requested block %ld was not free or outside address space */
#define	CLUSTER_FULL	3659
/* cluster/volume  %d on device '%s' is full */
#define	ROMFILE_SIZE_MISMATCH	3660
/* romfiles missing or too small: have read %ld blocks, expected are %ld */
#define	SEEK_FAULT	3661
/* the OS cannot seek file %s */
#define	ILLEGAL_BLOCK_FOR_FSM	3662
/* illegal block %ld for fsm  */
#define	LOGDIR_NOT_CLEAN	3663
/* illegal state in disk log directory: %s */
#define	DUMP_TA_ALREADY_ACTIVE	3664
/* illegal to start a fuzzy dump while a previous dump is still active */
#define	BFIM_SECTION_FULL	3665
/* */
#define	FSM_NOT_INITIALIZED	3666
/* FSM has not been initialized */
#define	FSM_CONSISTENCY	3667
/* FSM consistency error %d;\nRebuild FSM (FreeblockSpaceManagement) by Transbase tool `tbfsmrep' ! */
#define	BAD_DISKFILE	3668
/* corrupted diskfile or incompatible database version (diskfile %ld); perhaps database must be migrated */
#define	COMP_DECOMP_ERROR	3669
/* compress/decompress error */
#define	COMP_DECOMP_ERROR_2	3670
/* compress/decompress error: diskpage number %ld */
#define	FSM_UPPERBOUND_EXCEEDED	3671
/* on device %s, block %ld exceeds database address range */
#define	DECOMPRESS_ERROR	3672
/* error in decompression of rompage '%ld' */
#define	NO_THREAD_CREATED	3673
/* io thread creation failed  */
#define	PAGESIZE_NOT_SUPP	3675
/* Pagesize (%lu Bytes) not supported */
#define	LOG_BACKCHAINING_CORRUPTED	3700
/* log backchaining on pages is corrupted */
#define	UNEXPECTED_LOGRECORD	3701
/* unexpected logrecord: savepoint=%s, type=%ld, direction=%ld, actlsn=%ld(%ld),  targetlsn=%ld(%ld) */
#define	UNEXPECTED_INVALIDITY_LOG	3702
/* unexpected logfile end : code=%ld,lsn=%ld(%ld) */
#define	NO_LOGFILE_FOUND	3703
/* could not open logfile on booted database, reboot it, might be damaged */
#define	LOGRECORD_NOT_FOUND	3704
/* could not find logrecord with Lsn(%ld,(%ld,%ld)) in current logging files */
#define	DISKFILE_OLDER_THAN_LOGFILE	3705
/* diskfile generation older than available logfiles - (%ld (%ld,%ld)) versus  %ld - remove logfiles if diskfile clean, else database damaged */
#define	DISKFILE_YOUNGER_THAN_LOGFILE	3706
/* diskfile generation younger than available logfiles - (%ld (%ld,%ld)) versus  %ld */
#define	LOGFILE_DB_MISMATCH	3707
/* logfile '%s' belongs to DB '%s@%s' , not applicable to '%s@%s'*/
#define	LOGFILE_ADDRESS_SPACE_OVERFLOW_RESTART	3708
/* database needs a reboot to switch logfile address space */
#define	LOGFILE_COLLISION	3709
/* 2 logfiles with same number %ld appear in directory; one must be removed */
#define	LOGFILE_COLLISION2	3710
/* +++ unexpected event: 2 logfiles with same number %ld are in directory but presumably from different generations: filename %s:(%ld,(%ld,%ld)), filename %s:(%ld,(%ld,%ld)) */
#define	LOGFILE_NOT_CLEAN	3711
/* logfile with number %ld is not complete but not the youngest logfile */
#define	UNSOUND_LOGFILE_ORDER	3712
/* logfile extensions do not match logfile age: %s is older than %s, should be renamed */
#define	TBADMIN_DREC_ON_BFIMDB	3713
/* this command is only applicable on a database with logging recovery (not bfim recovery) */
#define	CANT_WAKEUP_ALL	3900
/* can not wake up all processes */
#define	DB_IN_USE	3901
/* Singleuser Database is already in use */
#define	INCONSISTENT_SEM	3902
/* inconsistent semaphores (id=%d, sema=%d) */
#define	INCONSISTENT_SHM	3903
/* Inconsistent shared memory (id=%d, dbid=%d) */
#define	INVAL_KEY	3904
/* dbid is equal to 0 (must be greater) */
#define	INVAL_STARTUP_SPEC	3905
/* invalid startup parameter (%s = %lu) */
#define	LESS_CACHE_SEGM	3906
/* cannot get requested number (%d) of shared memory cache segments */
#define	SEM_DIRTY_P	3907
/* found semaphore (id=%d, sema=%d) dirty (from process %ld) */
#define	SEM_DIRTY_V	3908
/* set semaphore (id=%d, sema=%d) dirty (process %ld) */
#define	SEM_MISMATCH	3909
/* the database identifier %d is associated with invalid semaphores */
#define	SHM_IN_USE	3910
/* shared memory in use (shmid = %d) %s */
#define	SIZE_TOO_LARGE	3911
/* size of shm segment exceeds system limit (%s = %lu) */
#define	TOO_MANY_USERS	3912
/* Too many users logged in (limited to %d) */
#define	TOTSIZE_MISMATCH	3913
/* computed size of shared memory is not equal to real size of shared memory (%ld != %ld) */
#define	WRONG_PID	3914
/* don't know pid %ld */
#define	WRONG_VERSNO	3915
/* have wrong version of shared memory, why this ?? */
#define	DB_BOOTED	3916
/* database is booted: please shut, then retry */
#define	BLOB_FAULT	3917
/* cannot read %ld bytes from file '%s' at offset %ld */
#define	RESOURCE_DIRTY	3918
/* Thread <%lx>: Resource (%d) has been left dirty by Thread <%lx> */
#define	WRONG_TYPES	4200
/* internal error: wrong type combination */
#define	COLNO_MISSMATCH	4500
/* for relation %ld, syscolumn exhibits %ld columns instead of expected %ld */
#define	SEG_NOT_FOUND	4501
/* cannot find segment %ld in systable */
#define	SURR_NOT_FOUND	4502
/* cannot find surrogate %ld in syssurrogate */
#define	NOT_EMPTY_AUTO	4503
/* automaton is not empty */
#define	RANGE_FAULT	4504
/* in a range lowerbound must be <= upperbound */
#define	INSENS_RANGE_FAULT	4505
/* illegal case insensitive range at position %d*/
#define	ILLSPAR	7000
/* illegal parameter in strfct */
#define	STRRES_TOO_LONG	7001
/* string result too long, more than MAXSTRINGSIZE characters */
#define	IBB_CONFUSION		2500
/* Confusion in ibbman (%s %ld %ld %ld %ld %ld);\n Please contact Transbase Team ! */
#define	IBB_WRONG_PROT		2501
/* wrong protocol handling for ibbman (%ld, %ld, %ld) */
#define	IBB_NOT_FOUND		2502
/*ibbman: tuple not found  %d, %d, %d */
#define	IBB_KEY_EXISTS		2503
/*ibbman: a tuple with that key already exists  %d, %d, %d */
#define	MYAND_EXP		12000
/* 'and' expected:%s */
#define	MYCHANGE_ADM_SC		12001
/* Can not change the security class of an user with user class myadm */
#define	MYCHANGE_ADM_UC		12002
/* Can not change the user class of user myadmin */
#define	MYCOMP_EXP		12003
/* '<','<=','>','>=','=','!=','like' or 'between' expected:%s */
#define	MYCON_OF_TYPE		12004
/* Type conflict of operands involving '%s' in archive %s */
#define MY_PAR_IN_USE		12005
/* There exist documents containing paragraph %s */
#define	MYDOC_ALREADY_AGED	12006
/* Document %ld already aged */
#define	MYDOCNO_NOT_EXISTS	12007
/* Unknown document number %ld in archive %s */
#define	MYDROP_ADM		12008
/* Can not drop user myadmin */
#define	MYEMPTY_WORD		12009
/* Can not archive the empty word */
#define	MYEOQ_EXP		12010
/* End of query, 'and', 'or' or 'minus' expected:%s */
#define	MYFLUSH_ON_CLIENT	12011
/* Archive <%s@%s> is a Retrieval System,\ncannot flush */
#define	MYIDENT_PATTERN_EXP	12012
/* IDENT or PATTERN expected:%s */
#define	MYILL_SF_TYPE		12013
/* Unknown field type: %s */
#define	MYINSUFF_SECCLASS	12014
/* Insufficient security class */
#define	MYINSUFF_USERCLASS	12015
/* Insufficient user class, must be min. %s */
#define	MYINVAL_SECCLASS	12016
/* Invalid security class: %d */
#define	MYINVAL_USERCLASS	12017
/* Invalid user class: %s */
#define	MYINVAL_VALUE		12018
/* Invalid literal for structure field: %s */
#define	MYLPAR_EXP		12019
/* '(' expected:%s */
#define	MYNEWER_EXISTS		12020
/* Document %ld already in Age Table */
#define MYPARISCAN_NOT_OPEN	12021
/* Paragraph information not open */
#define MYNO_PARS_ALLOWED	12022
/* No paragraphs allowed in this document */
#define	MYNO_CURR_DOCNO		12023
/* No current docno */
#define	MYNO_DOCNO_AVAIL	12024
/* No further docno available in security class %d */
#define	MYNO_DOC_OPEN		12025
/* No document open */
#define MYEQUAL_DOCNOS		12026
/* Old docno = new docno: %ld */
#define	MYNO_SESSION_OPEN	12027
/* No session open */
#define	MYNO_SF_SET		12028
/* Structure field not set */
#define	MYNUMBER_EXP		12029
/* NUMBER expected:%s */
#define	MYPHRASE_EXP		12030
/* 'phrase' expected:%s */
#define	MYQHSCAN_NOT_OPEN	12031
/* Query history not open */
#define	MYQUID_NOT_EXISTS	12032
/* Unknown query identifier: %ld */
#define	MYRBRACE_EXP		12033
/* '}' expected:%s */
#define	MYRPAR_EXP		12034
/* ')' expected:%s */
#define	MYSESSION_OPEN		12035
/* Session already open */
#define	MYSFISCAN_NOT_OPEN	12036
/* Structure field information not open */
#define	MYSFNAME_EXP		12037
/* Structure field name expected:%s */
#define	MYSFSCAN_NOT_OPEN	12038
/* No structure field open */
#define	MYSFTAB_EXP		12039
/* Structure field table name expected:%s */
#define	MYSF_ALREADY_SET	12040
/* 0:1 structure field already set */
#define	MYSF_EXISTS		12041
/* Structure field or table '%s' already exists */
#define	MYSF_NOT_01		12042
/* Structure field not of type 0:1: %s */
#define	MYSF_NOT_0N		12043
/* Structure field not of type 0:n: %s */
#define	MYSF_NOT_EXISTS		12044
/* %s: is a standard structure field, of wrong type\nor does not exist in archive %s */
#define	MYTERM_EXP		12045
/* '(', '{', 'result', 'struct' or 'phrase' expected:%s */
#define	MYTOO_MANY_SF		12046
/* Too many structure fields */
#define	MYUISCAN_NOT_OPEN	12047
/* User information not open */
#define MY_2ND_PAR_UDATA	12048
/* There exists a docclass having another paragraph with UserData1=%ld mapped */
#define MY_PAR_UDATA		12049
/* Docclass %d has already another paragraph with UserData1=%ld\nor an overlapping ParStart..ParEnd range [%ld..%ld] mapped */
#define	MYUSER_EXISTS		12050
/* User %s already exists */
#define	MYUSER_NOT_EXISTS	12051
/* Unknown user: %s */
#define	MYVAR_CORRUPTED		12052
/* Local variables corrupted, Myriad stopped */
#define	MY_ATLIMIT		12053
/* Limit of unsuccessful transactions (%d) reached  */
#define	MY_CANT_OPEN		12054
/* Can not open file %s */
#define	MY_CANT_WRITE		12055
/* Can not write to file %s */
#define	MY_CONFUSION		12056
/* Confusion in Myriad;\n Please contact Transbase Team ! */
#define	MY_ILL_DISTANCE		12057
/* Distance must not be <= 0 */
#define	MY_ILL_PAR		12058
/* Illegal input parameter combination */
#define	MY_ILL_PHR_CL		12059
/* Unknown class or phrase not member of class */
#define	MY_ILL_QUID		12060
/* Illegal QueryId: %s */
#define	MY_ILL_SORT		12061
/* Illegal order flag %d (%d .. %d) */
#define	MY_ILL_SYN		12062
/* Synonym or narrower term must not be the empty string */
#define	MY_ILL_USERDATA		12063
/* Illegal column %d (%d .. %d) */
#define	MY_ILL_VERSCTL		12064
/* Status of version control must be in (ACTUAL_DOC, ALL_DOCS) */
#define	MY_INCOMPLETE_LOAD	12065
/* Load not complete: %s */
#define	MY_INVAL_LID		12066
/* Invalid loader identifier: %s */
#define	MY_LID_EXISTS		12067
/* Loader identifier already exists: %s */
#define	MY_LID_TOO_LONG		12068
/* Loader identifier too long, must be <= %d: %s */
#define	MY_ONLY_OUT_OF_TA	12069
/* This call is allowed only outside of a transaction */
#define	MY_RES_NAME		12070
/* Reserved name of Myriad: %s */
#define	MY_SYERR_DESCFILE	12071
/* syntax error in %s: %s */
#define	MY_UNKNOWN_LID		12072
/* Unknown loader identifier: %s */
#define	MY_UNKNOWN_TCLASS	12073
/* Unknown Synonym Class %ld */
#define	MY_SF_NOT_MAPPED	12074
/* Structure field %s not mapped to class of document */
#define	MY_NO_CLASSID		12075
/* Too many classes */
#define	MY_CLASSID_EXISTS	12076
/* Docclass %d already exists */
#define	MY_CLASSNAME_EXISTS	12077
/* Classname %s already exists */
#define	MY_CLASS_NOT_EMPTY	12078
/* Class %d is not empty */
#define	MY_UNKNOWN_CLASS	12079
/* Class %d does not exist */
#define	MYCLISCAN_NOT_OPEN	12080
/* Class information not open */
#define	MYLD_EOL_EXP		12081
/* '#' or '\n' expected */
#define	MYLD_SF_SEP_EXP		12082
/* STRUCTURE_FIELD_NAME, '%%' or '@' expected */
#define	MYLD_PATH_TOO_LONG	12083
/* PATH too long (> %d) */
#define	MYLD_SECCLASS_EXP	12084
/* SECURITY_CLASS expected */
#define	MYLD_DOCCLASS_EXP	12085
/* DOCUMENT_CLASS expected */
#define	MYLD_PREM_EOF		12086
/* Premature end of file: %s */
#define	MYLD_POPEN_F		12087
/* Can not open pipe to command '%s' */
#define	MYLD_PCLOSE_F		12088
/* Command '%s' exited with exitstate %d */
#define	MYLD_DOUBLE_DOCNO	12089
/* Can not handle a document twice in one transaction */
#define	MYLD_FILELIST_EXP	12090
/* FILE_LIST expected */
#define	MYLD_DOCNO_SFPRED_EXP	12091
/* DOCNO or STRUCTURE_PREDICATE expected */
#define	MYLD_SFPRED_FAILURE	12092
/* STRUCTURE_PREDICATE delivers no or more than one document */
#define	MYLD_DOUBLE_SF		12093
/* Can not handle a structure field twice in one transaction */
#define	MYLD_SFVAL_EXP		12094
/* STRUCTURE_FIELD_VALUE expected */
#define	MYLD_BLOCKSPEC_EXP	12095
/* 'add', 'delete', 'new' or 'set' expected */
#define	MY_HARD_ERR		12096
/* Transaction aborted by MYRIAD */
#define	MYNAME_TYPE_MISM	12097
/* Different number of fieldnames and fieldtypes (%d != %d)*/
#define	MYEMPTY_FIELDLIST	12098
/* Missing fieldnames */
#define	MY_EMPTY_LIST		12099
/* Empty input list */
#define MY_DOCS_PAR_EX		12100
/* There exist documents having paragraph %s set */
#define MY_SFOPEN_INVAL		12101
/* Can not open invalid structure field information */
#define	MY_CONFLOADER		12102
/* Confusion in Myriad Loader;\n Please contact Transbase Team ! */
#define MYPAR_EXP		12103
/* 'paragraph' expected:%s */
#define MYLD_DIRECTIVE_EXP	12104
/* 'directive' expected */
#define MYLD_START_END_EXP	12105
/* 'start' or 'end' expected */
#define MYLD_DIRSEP_EXP		12106
/* character or 0x.. expected */
#define	MY_PARNAME_EXISTS	12107
/* Paragraph %s already exists */
#define	MY_PARRANGE_FAULT	12108
/* Illegal range in paragraph definition: [%ld, %ld] */
#define	MY_NO_PARID		12109
/* Too many paragraphs */
#define	MY_UNKNOWN_PAR		12110
/* Paragraph %s does not exist */
#define MYNO_PARS_IN_CLASS	12111
/* Document class of current document has no paragraphs mapped,\nor all paragraphs are used */
#define MYILLEGAL_PAR_USG	12112
/* Specified paragraph is not mapped to document class of current document\nor paragraph already used */
#define	MYNO_PAR_SET		12113
/* No current paragraph set */
#define	MYPAR_OVERFLOW		12114
/* End of range of paragraph %s reached */
#define	MYNO_CURRENT_PAR	12115
/* No current paragraph set */
#define	MYRPAR_COMMA_EXP	12116
/* ',' or ')' expected:%s */
#define	MYPARNAME_EXP		12117
/* Paragraph name expected:%s */
#define	MYLD_ILL_DIR		12118
/* Empty loader directive or directive not known: %s */
#define	MYLD_PRE_DIR_END	12119
/* Premature end of loader directive: %s */
#define	MYLD_DIR_END_SEP_EXP		12120
/* Loader directive end separator expected: %s */
#define	MYLD_WORD_SEP_EXP		12121
/* Word separator after loader directive expected: %s */
#define	MYLD_ILL_PARUDATA	12122
/* Illegal formed UserData1 (%s) in paragraph directive: %s */
#define	MYMIG_ARCH		12123
/* archive must be adapted, run adaption script 'mymigmul.ccl' */
#define	MY_ILL_HISTCTL		12124
/* Status of history control must be in (HIST_ON, HIST_OFF) */
#define	MY_UNKNOWN_ARCH		12125
/* Archive <%s> unknown */
#define	MY_NO_SUBS		12126
/* Result archive set of QueryId %ld is no superset of actual archive set */
#define	MY_NOT_IN_CAS		12127
/* No session open on archive %s */
#define	MY_NOT_IN_AAS		12128
/* Archive %s is not member of the actual archive set */
#define MY_NR_AAS_NE_1		12129
/* Number of archives in the actual archive set is not equal 1 */
#define MY_SF_NOT_COMPAT	12130
/* Type mismatch of structure field %s in actual archive set */
#define MYFEATURE_NOT_SUPPORTED	12131
/* Myriad Feature not supported in Transbase Fulltext:%s */
#define MY_VSCS_OFLOW		12132
/* Cannot represent string longer than %ld bytes on heap */
#define MY_ILL_GROUPING		12133
/* Value of grouping information must be in [0 .. 2] */
#define	VOL_NOTINIT		13000
/* volman seems to be not initialized !! */
#define	VOL_OVERFLOW		13010
/* Blocknumber outside address space of device (%s: %d, %ld %ld %ld %ld) */
#define	VOL_GAPACCESS		13012
/* page access into a gap of address space(%s: %d, %ld %ld %ld %ld) */
#define	VOL_NOCRCLU		13015
/* Database (%s@%s) is not an Editorial System,\nCreating Cluster not allowed (clnr: %d) */
#define	MISSING_RFILE       	13020
/* romfile nr. %d is missing */
#define	BATCH_MISSING_ROM      	13025
/* CD-ROM %d: bad contents or not promptable in batch */
#define	UNSOUND_CLSIZE    	13030
/* romfile %d has unsound size %ld (%d) */
#define	UNSOUND_STPG    	13032
/* romfile %d has unsound startpg %ld (%ld) */
#define	SLOT_OCCUPIED     	13040
/* Slot %ld on Device %s already occupied <%s> */
#define	FILE_OCCUPIED     	13050
/* File %s already occupied for Device %s %ld */
#define	READ_ERROR              14000
/* Unexpected contents in %s */
#define	READ_ERROR2		14001
/* Unexpected or missing contents in %s:\nSection=%s, Key=%s */
#define	WRITE_ERROR             14010
/* Can't write to %s */
#define	WRITE_ERROR2		14011
/* Can't write to %s:\nSection=%s, Key=%s */
#define DLL_INIT_FAILED		14012
/* The initialization of the DLL '%s' failed */
#define TOO_MANY_ATTACHED_TASKS	14013
/* too many attached tasks on '%s' */
#define	INI_RENAMEKEY		14014
/* File %s:\nCan't rename key in section '%s' from '%s' to '%s'\nProbably duplicate exists */
#define	INI_RENAMESECTION		14015
/* File %s:\nCan't rename section '%s' to '%s'\nProbably duplicate exists*/
#define TT_ILL_DESC		15000
/* Illegal value in descriptor */
#define TT_DB_NOT_EMPTY		15001
/* Database not empty */
#define TT_SYN_ERR		15002
/* Syntax error in line %ld */
#define TT_ILL_ESC		15003
/* Escape character is equal to tuple or attribute separator, line %ld */
#define TT_ILL_TS		15004
/* Tuple separator is equal to escape character, line %ld */
#define TT_ILL_AS		15005
/* Attribute separator is equal to escape character, line %ld */
#define TT_NULL_ON_NOTNULL	15006
/* Can not insert NULL value at NOTNULL attribute, line %ld */
#define TT_UNKNOWN_ATTR		15007
/* Unknown column %s, line %ld */
#define TT_FORMAT_EXP		15008
/* 'DUAL', 'HEXA' or 'BINARY' expected, line %ld */
#define TT_IDENT_EXP		15009
/* TABLE_NAME or COLUMN_NAME expected, line %ld */
#define TT_COMMA_RPAR_EXP	15010
/* ',' or ')' expected, line %ld */
#define TT_NUMBER_EXP		15011
/* NUMBER expected, line %ld */
#define TT_DUAL_EXP		15012
/* DUAL_DIGIT expected, line %ld */
#define TT_HEXA_EXP		15013
/* HEXA_DIGIT expected, line %ld */
#define TT_SIZE_EXP		15014
/* SIZE expected, line %ld */
#define TT_BOOL_EXP		15015
/* 'TRUE' or 'FALSE' expected, line %ld */
#define TT_RANGE_MISMATCH	15016
/* mismatch of DATETIME/TIMESPAN literal with range, line %ld */
#define TT_WRONG_SEPARATOR	15017
/* wrong separator symbol in DATETIME/TIMESPAN literal, line %ld */
#define TT_INVALID_RANGE	15018
/* illegal range of DATETIME/TIMESPAN, line %ld */
#define TT_SCRIPT_LINE		15019
/* Error near line %ld */
#define MAC_GETSYSFOLD		15500
/* cannot find System folder on volume=%ld rc=%ld (%s) */
#define MAC_GETCPFOLD		15502
/* cannot find System folder rc=%ld (%s) */
#define MAC_DNROPEN		15504
/* domin name resolver not open */
#define MAC_GETMYIP		15506
/* cann't get own IP-Address or Netmask rc=%ld ioResult=%ld (%s) */
#define MAC_TCPOPEN		15508
/* cannot open TCP driver, rc=%ld (%s) */
#define MAC_TCPCREATE		15510
/* cannot create TCP stream, rc=%ld ioResult=%ld (%s) */
#define MAC_NOSTREAM		15512
/* cannot not create TCP stream, socknr=%ld domain=%ld type=%ld protocol=%ld */
#define MAC_TCPABORT		15514
/* cannot abort TCP stream=%lu, rc=%ld (%s) */
#define MAC_SOCKPARAMS		15516
/* wrong params for socket(), domain=%ld, type=%ld, protocol=%ld */
#define MAC_TOOMUCHSOCK		15518
/* too much sockets requested from TCP, max=%ld */
#define MAC_NOTSOCK		15520
/* unsound socket descriptor in %s(): %ld */
#define MAC_SOCKCONN		15522
/* connect to socket descriptor: %ld failed, already connected */
#define MAC_SOCKCLOSE		15524
/* release TCP stream=%lu, driver=%ld failed, rc=%ld (%s) */
#define MAC_CONN		15526
/* connect to  port %ld, addr=0x%lx, socked=%ld failed, rc=%ld (%s) */
#define MAC_TCPWRITE		15528
/* TCP-driver cannot send data, rc=%ld ioResult=%ld (%s) */
#define MAC_GETHBYNA		15530
/* gethostbyname/address failed for name=%s addr=0x%lx\nrc=%ld (%s) */
#define MAC_NOTDNR		15534
/* domain name resolver not found, rc=%ld */
#define MAC_DNS_TIMEOUT		15540
/* no answer from DNS domain name server within %ld minutes */
#define	MAC_SYNTAX_ERROR	15580
/* Syntax Error at: %s <<=== */
#define MAC_VARNOTSET		15582
/* environment variable `%s' not set in %s */
#define MAC_NOCURSOR		15584
/* can't get Transaction Cursor Resource (i=%ld) */
#define	MAC_CONFUSION		15598
/* Confusion in Mac modules (%s %ld %ld %ld %ld %ld);\n Please contact Transbase Team ! */
#define MAC_LAST		15600
/* dummy last error entry on Mac */
#define INVALID_PARAMETER_ORDINAL_NUMBER	16500
/* invalid parameter in ordinal_number */
#define INVALID_PARAMETER_BITSTR	16501
/* invalid parameter in ordinal_number */
#define INVALID_WRITE_POSITION_BITSTR	16502
/* invalid parameter in ordinal_number */
#define INVALID_PARAMETER_QUERYBOX	16503
/* invalid parameter for querybox ubvalue set */
#define INVALID_PARAMETER_UBVALUESET	16504
/* ubtree expected %ld search arguments, %ld arrived  */
#define INVALID_SYSCATALOG 16600
/* the retrieval or update of an external resource, method, or option '%s' failed,\n the system catalog might be corrupted */
#define FUNCTION_NOT_FOUND 16601
/* a function '%s%s' does not exist in the database */
#define PROCEDURE_NOT_FOUND 16602
/* a procedure '%s%s' does not exist in the database */
#define RESOURCE_NOT_FOUND 16603
/* a resource '%s%s' does not exist in the database */
#define UNKNOWN_SQLTYPE 16604
/* unkown SQL type %s, don't know how to map to an external type */
#define UNKNOWN_EXTERNALTYPE 16605
/* unkown external type '%s', don't know how to map to an SQL type */
#define RESOURCE_DISABLED 16607
/* resource '%s' is currently disabled. Use ALTER EXTERNAL ENABLE first. */
#define FUNCTION_DISABLED 16608
/* function '%s%s' is currently disabled. Use ALTER FUNCTION ENABLE first. */
#define PROCEDURE_DISABLED 16609
/* procedure '%s%s' is currently disabled. Use ALTER PROCEDURE ENABLE first. */
#define FUNC_WRONG_PREC	16610
/* the external function '%s' returned a value of type '%s' with higher precision than max precision %ld */
#define FUNC_WRONG_SCALE 16611
/* the external function '%s' returned a value of type '%s' with higher scale %ld than precision %ld */
#define PROC_WRONG_PREC	16612
/* the external procedure '%s' returned parameter no. %ld of type '%s' with higher precision than max precision %ld*/
#define PROC_PREC_MISMATCH	16613
/* the external procedure '%s' returned parameter no. %ld with INOUT precision mismatch. IN is:%s OUT is:%s */
#define PROC_WRONG_SCALE	16614
/* the external procedure '%s' returned parameter no. %ld of type '%s' with higher scale than precision %ld */
#define TFUNC_CONSTR_NOT_FOUND 16615
/* missing constructor method for TABLE FUNCTION '%s' */
#define TFUNC_EVAL_NOT_FOUND 16616
/* missing evaluation method for TABLE FUNCTION '%s' */
#define JVM_CLASSLOADER_NOT_FOUND 16700
/* internal JDBC driver not correctly installed. Refer to your manual's troubleshooting section for more details. */
#define JVM_CLASSLOADER_FAILED 16701
/* the JVM refused to load class %s due to an exception:\n%s */
#define JVM_NO_SUCH_RESOURCE 16702
/* the java resource '%s' could not be retrieved or is not valid.\n%s */
#define JVM_NO_SUCH_METHOD 16703
/* the java method '%s%s' was not found.\n%s */
#define JVM_CANT_REGISTER_NATIVE 16704
/* cannot register native method %s due to an exception:\n%s */
#define JVM_CANT_CREATE_JVM 16705
/* cannot create Java VM.\n%s\nRefer to your manual's troubleshooting section for more details. */
#define JVM_MTAID_INVALID 16708
/* the transaction identifier is invalid due to missing Begin Transaction */
#define JVM_EXCEPTION_OCCURRED 16709
/* a user defined java class threw an exception:\n%s */
#define JVM_DUPLICATE_RESOURCE	16710
/* a java resource '%s' is already present in the database.\nTry DROP or ALTER instead */
#define JVM_DUPLICATE_METHOD 16711
/* a java method '%s%s' is already present in the database.\nTry DROP or ALTER instead */
#define JVM_OUT_OF_MEMORY 16713
/* the java virtual machine ran out of memory */
#define JVM_COMPILE_ERROR 16714
/* the compilation of your java source '%s' failed.\nThe java compiler generated the following error report:\n%s */
#define JVM_COMPILER_NOT_FOUND 16715
/* the java compiler is not available on this system.\nRefer to your manual's troubleshooting section for more details. */
#define JVM_INVALID_NULL	16716
/* invalid null value found for non-nullable parameter at position %ld */
#define JVM_TOO_MANY_OPTIONS	16717
/* too many options. currently a maximum of %ld options are allowed for the virtual machine */
#define JVM_DEBUG_ON	16718
/* connection is now in debugging mode.\nThe next call to a java procedure will suspend this kernel associated with this connection until you connect with jdb at '%s' */
#define JVM_DEBUG_OFF	16719
/* switching to debugging mode failed because %s */
#define JVM_LDLIB_PATH	16720
/* cannot create Java VM because environment LD_LIBRARY_PATH does not comprise '%s' or is not set at all.\nRefer to your manual's troubleshooting section for more details. */
#define ASYNC_EXEC_ERROR	16800
/* Asynchronous query execution returned an error: %ld\n%s */
#define REMOTE_EXEC_ERROR	16801
/* Remote query execution on database %s@%s returned an error code: %ld\n%s */
#define VERSION_MISMATCH_DISTRIBUTED_QUERY	16802
/* Remote query execution returned a version mismatch */
#define STARVATION_REMOTE_VERSION	16803
/* Remote query execution suffered a starvation due to version mismatch */
#define TOO_MANY_REMOTE_WRITERS	16804
/* Inserts in more than one remote databases in same transaction */
#define REMOTE_WRITER_IN_DISTRIBUTED_TA 16805
/* Illegal remote insert inside a distributed transaction */
#define DISTRIBUTE_TA_AFTER_REMOTE_WRITER 16806
/* Cannot distribute transaction after a remote insert took place */
#define UNEXPECTED_DISTRIBUTION_PATTERN	16807
/* unexpected pattern of REMOTE tree - ATTR referencing */
#define TCI_MIN_ERROR 	16999
/* smallest error for TCI */
#define TCI_INTERNAL_TCI	17000
/* Internal error in TCI; please consult Transbase team */
#define TCI_INVALID_HANDLE	17001
/* Invalid handle */
#define TCI_INDEX_OUT_OF_RANGE	17002
/* Index out of range */
#define TCI_BUFFER_TOO_SMALL	17003
/* Buffer too small */
#define TCI_INVALID_ATTRIBUTE	17004
/* Invalid attribute */
#define ATTRIBUTE_NOT_WRITABLE	17005
/* Attribute not writable */
#define TCI_ALREADY_CONNECTED	17006
/* Connection already used */
#define TCI_REC_OUT_OF_RANGE	17007
/* Record out of range */
#define TCI_TA_EXISTS	17008
/* Connection already associated with a transaction */
#define TCI_NOT_IN_SINGLECHAR	17009
/* Routine not available in singlechar configuration */
#define TCI_NOT_IN_WIDECHAR	17010
/* Routine not available in widechar configuration */
#define TCI_ALREADY_PREPARED	17011
/* Statement is already prepared */
#define TCI_MORE_THAN_ONE_ROW	17012
/* One row select delives more than one tuple */
#define TCI_NOT_SUFFICIENT_PARAMS	17013
/* Not sufficient input parameters delivered */
#define TCI_INVALID_TYPE	17014
/* Types not compatible */
#define TCI_NO_TA	17015
/* No transaction open */
#define TCI_NOT_PREPARED	17016
/* Statement is not prepared */
#define TCI_WIDECHAR_FAILURE 17017
/* Can not convert wide character 0x%lx to multibyte character */
#define TCI_MULTIBYTE_FAILURE 17018
/* Can not convert multibyte character 0x%s to wide character */
#define TCI_BIGINT_OUT_OF_RANGE 17019
/* Error in type adaption: bigint value <%ld, %lu> not in range of TB__INTEGER */
#define TCI_UBIGINT_OUT_OF_RANGE 17020
/* Error in type adaption: ubigint value <%lu, %lu> not in range of TB__INTEGER */
#define TCI_BULK_FULLBIND	17021
/* For bulk fetch all columns have to be bound */
#define TCI_NOT_ON_PREPARED_STATEMENT	17022
/* ExecuteDirect() is not allowed on a result set which is member of a prepared statement */
#define TCI_NOT_ON_STMT_WITH_MANY_RESSETS 17023
/* ExecuteDirect() is not allowed on a result which is member of a statement with more than 1 result */
#define TCI_INVALID_HVRTYPE 17024
/* Datatype of value buffer changed between two TCIGetData() calls without a TCIResetColumn() */
#define TCI_ENV_MISMATCH 17025
/* ResultSets do not belong to the same environment */
#define TCI_NO_REF_RESULTSET 17026
/* No referenced ResultSet set */
#define TCI_TRANSACTIONS_ROLLEDBACK 17027
/* All active transactions have been rolled back */
#define TCI_COLUMN_NOT_FOUND 17028
/* Column not found */
#define TCI_INVALID_SUBST_CHAR 17029
/* Invalid substitute character (must be in ASCII range) */
#define TCI_PARAMETER_NOT_FOUND 17030
/* Parameter not found */
#define TCI_DATA_TRUNCATION 17031
/* data truncation */
#define TCI_MAX_ERROR 	17032
/* upper bound for TCI errors  - !! adapt this number if errors are added !! */
#define	DIV_BY_ZERO	19000
/* error in operation 'division': second operand is 0 */
#define	FLOAT_OUT_OF_RANGE	19001
/* error in type adaption: value %le is not in range of type %s */
#define	INT_OUT_OF_RANGE	19002
/* error in type adaption: value %ld is not in range of type %s */
#define	STRING_CAST_NOT_APPLICABLE	19003
/* error in type adaption: string '%s' is no valid representation of type %s */
#define	STRING_OUT_OF_RANGE	19004
/* error in type adaption: value %s is not in range of type %s */
#define	TYPE_OVERFLOW	19005
/* overflow in operation '%s': values %.100s and %.100s of type %s */
#define	UINT_OUT_OF_RANGE	19006
/* error in type adaption: value %lu is not in range of type %s */
#define	CHAR_NO_NUMBER	19007
/* error in type adaption: value '%s' is not a number */
#define	CHAR_NO_BOOL	19009
/* error in type adaption: value '%s' is not a BOOL */
#define DOUBLE_OUT_OF_RANGE	19011
/* double value out of range */
#define	MORE_ATTR	19500
/* More Attributes needed */
#define	INTVAL_EXP	19501
/* Integer Value expected */
#define	FLODO_EXP	19502
/* Float/Double Value expected */
#define	EOTUP_EXP	19503
/* End of Tuple expected */
#define	CLOPAR_EXP	19504
/* ')' expected */
#define	BOOL_EXP	19505
/* Boolean Value expected */
#define	NOTNULL_EXP	19507
/* Nullvalue not allowed */
#define	VAL_EX_RNG	19508
/* Value exceeds type range */
#define	QUOTE_EXP	19509
/* right quote >%c< expected */
#define	OPPAR_EXP	19510
/* '(' expected */
#define	C_ERROR	19511
/* %12.12s%12.12s%12.12s%7.7s %s */
#define	INTVAL_EXP_POLYGON	19512
/* Integer Value expected in ascii polygon description */
#define	FLODO_EXP_POLYGON	19513
/* Float/Double Value expected in ascii polygon description */
#define	C2_ERROR	19514
/* File '%s', position: Tuplebegin in line %ld, Actual_Line=%ld */
#define	ILLEGAL_POLYGON	19515
/* Illegal header in polygon blob */
#define	BINCHAR_EXP	19517
/* Binary string expected */
#define	BLOBADDRFILE_EOF	19518
/* unexpected end of blob address file */
#define	BLOBADDRFILE_ERROR	19519
/* bad format in blob address file */
#define	BITS_EXP	19520
/* Bits expected */
#define	OFFSET_SPEC_EXP	19521
/* Offset:Size Specification for Blob  expected */
#define	NO_PREVIOUS_FILENAME	19522
/* No filename for relative adressing has been seen before */
#define	UBVALUE_EXP	19523
/* Ubvalue expected */
#define	C_ERROR_2	19524
/* %12d%12ld%12ld%7ld %s */
#define	UNEXPECTED_NODE	20000
/* unexpected node '%s' */
#define	NOT_IMPLEMENTED	20001
/* '%s' not implemented */
#define	NO_ICSQL_TYPE	20002
/* ICSQL does not support data type '%s' */
#define	WRONG_ICSQL_TYPE	20003
/* wrong type for ICSQL: code %d, prec %d, scale %u */
#define	ILL_SIZE	22000
/* illegal size %d for smallu() */
#define	ILL_LT	22001
/* illegal lifetime %d for smallu() */
#define	CANNOT_PREPARE_REMOTE_UPDATE_STATEMENT	22002
/* cannot prepare a remote UPDATE or DELETE statement */

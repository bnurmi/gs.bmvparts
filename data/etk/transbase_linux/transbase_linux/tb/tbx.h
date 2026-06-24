/******************************************************** 

                      T r a n s B a s e / C D
  @(#) tbx.h:   V6.1.2.19 (Build 404)
		Project: 4.119.1.19
		2004/08/05 11:46:57

  Copyright (c) 1995 - 
  Transaction Software GmbH
  D 81739 Munich 

 *********************************************************/

/* Module begin */
#ifndef _TBX_H
#define _TBX_H

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
#ifdef _WIN32
#define DLLDATAIMPORT  __declspec(dllimport) extern
#ifndef TLS_DATA
#define TLS_DATA  __declspec( thread ) 
#endif
#define TBXFAR
#define DLLEXPORT
#define TB_API __stdcall
#ifndef USE_PROTOTYPES
#define USE_PROTOTYPES 1
#endif
#else
#ifdef _WINDOWS
#define DLLDATAIMPORT extern
#ifndef TLS_DATA
#define TLS_DATA  
#endif
#define TBXFAR _far
#define DLLEXPORT	_far _pascal 
#define TB_API	_far _pascal 
#ifndef USE_PROTOTYPES
#define USE_PROTOTYPES 1 
#endif
#else
#define DLLDATAIMPORT extern
#ifndef TLS_DATA
#define TLS_DATA  
#endif
#define TBXFAR
#define DLLEXPORT
#define TB_API
#ifndef USE_PROTOTYPES
#define USE_PROTOTYPES 0
#endif
#endif
#endif
#ifndef _TBERRTXT
#define _TBERRTXT
#define tb_errtxt	tb_errtxt_adr()
#endif






#define _1MB ((Uint4)0x00100000)
#define _1GB ((Uint4)0x40000000)


#define FILLER_1(d1) char d1;
#define FILLER_2(d1,d2) char d1,d2;
#define FILLER_3(d1,d2,d3) char d1,d2,d3;







#define DB_TRANSBASE (0)
#define DB_ICSQLS (1)
#define DB_ICSQLU (2)

#define MAXERRLEN 4096
#define MAXQUERYSIZE 4096 /* actually no restrictions in */
                                /* TransBase. Constant supported for */
                                /* compatibility */
#define MAXTUPLESIZE 4000
#define MAXATTRNO 256 /* must be multiple of 32 */


#define MAXEXTPARAMNO 64 /* max paramno for external nodes */
#define MAXEXTIDENTSIZE 128 /* max length of an external sqlname */
#define MAXEXTSIGNATURE (MAXATTRNO*4) /* should be enough ?? */
#define MAXEXTOPTIONS 24
#define MAXCOMMENTSIZE 256
#define EXT_UNDEF (-127)
#define RTYPECLASS (2) /* java class */
#define RTYPEJAR (1) /* java archive */
#define RTYPEOPTION 0 /* option */
#define RTYPEJSRC (-2) /* java source */
#define RTYPEJZIP (-1) /* zip archive of jar source tree */
#define ETYPERESOURCE 0
#define ETYPEFUNCTION 1
#define ETYPEPROCEDURE 2
#define ETYPETABLE 3
#define ETYPECONS 4
#define ETYPECONV 5
#define RKEYCLASSPATH (-1) /* option keys */
#define RKEYJDK (-2)
#define RKEYJAVADEBUG (-3)
#define RKEYJAVA (-4)
#define PARAMMODE_IN 'I' /* In */
#define PARAMMODE_OUT 'O' /* Out */
#define PARAMMODE_INOUT 'B' /* Both */
#define PARAMMODE_INSTANCE 'M' /* instanceMethod */
#define PARAMMODE_INSTANCEOUT 'R' /* Returninstance */
#define EXTNOSQL 0
#define EXTCONTAINSSQL 1
#define EXTREADSDATA 2
#define EXTMODIFIESDATA 3

#define MAXSTRINGSIZE MAXTUPLESIZE
#define MAXATTRSIZE MAXSTRINGSIZE
#define MAXSCHEMA 18 /* max length of a schema name */

#define MAXIDENTSIZE 31

/* session- and transaction-control */
#define UNDEF_STATE (1<<0)
#define TA_UNDEF UNDEF_STATE
#define TA_NOT_ACTIVE (1<<1)
#define TA_ACTIVE (1<<2)
#define TA_PREP (1<<3)
#define TA_COMMITTED (1<<4)
#define TA_ABORTED (1<<5)
typedef unsigned char Uint1;
typedef short Int2;
typedef unsigned short Uint2;
typedef long Int4;

#define PREFIX_SYSRESERVED_NAME "@@sys"
                /* prefix for all system generated constraintnames and
		   catalog tables */
#define SIZE_PREFIX_SYSRESERVED_NAME 5

/* Some special type-definitions */
/* machine dependent integer definitions */
typedef char Int1;







typedef Int2 Attr_pt;
typedef int Error;
typedef unsigned long Uint4;
typedef long Bno;
typedef Bno Sno;
typedef char Dev;

typedef int Volid;
#define VOL_UNDEF ((Volid)-1)
#define SNO_UNDEF ((Sno)-1)

typedef long Tb_pid;
#define TBPID_UNDEF ((Tb_pid)0)



/********	Coding of Types of attributes    **************/

#define TB__UNDEFTYPE (0) /* represents not existing type,
				  don't change this code ! */
#define TB__TINYINT (5) /* represents type 'Tinyint' */
#define TB__SMALLINT (6) /* represents type 'Smallint' */
#define TB__INTEGER (1) /* represents type 'Integer' */
#define TB__IKVALUE TB__INTEGER/* represents internal type 'Ik-Value' */
#define TB__NUMERIC (3) /* represents type 'Numeric' */
#define TB__FLOAT (7) /* represents type 'Float' */
#define TB__DOUBLE (2) /* represents type 'Double' */
#define TB__CHAR (4) /* represents type 'String' var/fix */
#define TB__DATETIME (8) /* represents type 'Datetime' */
#define TB__TIMESPAN (9) /* represents type 'Timespan' */
#define TB__MONEY (10) /* represents type 'Money' */
#define TB__BOOL (11) /* represents type 'Bool' */
#define TB__BINCHAR (12) /* represents type 'binary char' var/fix */
#define TB__BLOB (13) /* represents type 'Blob' */
#define TB__BITSS (14) /* represents type 'Bits' var/fix */
#define TB__NULLTYP (15) /* represents null values in optrees */

#define C_INT (16) /* represents C type 'int' */
#define C_UCHAR (17) /* represents C type 'unsigned char' */
#define C_USHORT (18) /* represents C type 'unsigned short' */
#define C_UINT (19) /* represents C type 'unsigned int' */
#define C_ULONG (20) /* represents C type 'unsigned long' */
#define C_CHAR (21) /* represents C type 'char' */
#define C_SHORT (22) /* represents C type 'short' */
#define C_LONG (23) /* represents C type 'long' */
#define C_FLOAT (24) /* represents C type 'float' */
#define C_DOUBLE (25) /* represents C type 'double' */
#define STMTVAR (26) /* represents a statement variable,
				   i.e. char* or char[] */
#define TB__BLOBNAME (27) /* represents type 'Blobname' */
#define TB__FILEREF (28) /* represents type 'FILEREF' */
#define TB__VARCHAR (29) /* represents type 'VARCHAR' */
#define TB__UBVALUE (30) /* represents type 'UBVALUE' */
#define TB__BITSS2 TB__UBVALUE
                                /* internal bitstring type (for 
				surrogates), definition equivalent to 
				Ub_value ,
				type BITSS has 4-byte length field,
				type BITSS2 has 2-byte length field,
				*/

/* !! Attention to "is_conv_type" */

#define TB__MAXTYPES (30) /* for macro iskerneltype */

#define TB__STRING TB__CHAR /* for compatibility */
#define TB__REAL TB__DOUBLE /* for compatibility */


/****** National Language Parameters ****/

#define USA 10
#define EUR 11
#define ISO 12
#define TRB 20

#define TB__MS 0
#define TB__SS 1
#define TB__MI 2
#define TB__HH 3
#define TB__DD 4
#define TB__MO 5
#define TB__YY 6
#define TB__WEEKDAY 7
#define TB__UNDEFRANGE 8


/******* modes for Blobdesc ****/
#define MMADR 0
#define FILENAME 1
#define PASSLEN MAXIDENTSIZE
#define DBPATHLEN 256
#define DBNAMLEN 128


#define tb_dt_datetime(d, n, p) tb_dt_dt((d), (n), (p)) /* For upward Compatibility */


/** Macros for Tuple Handling  ( Tuple *tp ) **/
/** a tuple either has no attributes (empty tuple) or
    n>0 attributes  attr.0 ..... attr.n-1  **/

           /* index of last attr-pointer; might be a filling pointer */
#define lastboatix(tp) ( ((Tuple TBXFAR *)(tp))->boat[0]/2-1)

         /* last attr-pointer; might be a filling pointer */
#define lastattrpt(tp) ( ((Tuple TBXFAR *)(tp))->boat[lastboatix(tp)] )

        /* number of attr's: check if last attrpointer is a filling! */
#define tpattno(tp) (lastattrpt(tp)>=((Tuple TBXFAR *)(tp))->boat[0]? ((Tuple TBXFAR *)(tp))->boat[0]/2-1: lastattrpt(tp))



              /* length of tuple */
#define tplgth(tp) ( ((Tuple TBXFAR *)(tp))->boat[tpattno(tp)] )

              /* length of attr. i */
#define attlgth(tp,i) ( ((Tuple TBXFAR *)(tp))->boat[(i)+1] - ((Tuple TBXFAR *)(tp))->boat[i] )

              /* char Pointer (absolute) to attr. i; assertion: no null value */
#define ptoatt(tp,i) ( ((Tuple TBXFAR *)(tp))->info + ((Tuple TBXFAR *)(tp))->boat[i] )

              /* test if attr. i is NULL value */
#define isnull(tp,i) ( ((Tuple TBXFAR *)(tp))->boat[i] == ((Tuple TBXFAR *)(tp))->boat[(i)+1] )

       /* pointer (char*) to attribute i: NULL if i is the null value */
#define ptoattornull(tp,i) ((((Tuple TBXFAR *)(tp))->boat[i]==((Tuple TBXFAR *)(tp))->boat[(i)+1])? NULL:(((Tuple TBXFAR *)(tp))->info+((Tuple TBXFAR *)(tp))->boat[i]))


              /* tuple empty? */
#define is_empt_tuple(tp) ( tpattno(tp)==0) /*tuple with 0 attributes*/

#define PTA(tp,i) (ptoattornull(tp,i))

/* constants referring to mql queries and optree size */



typedef union /**** TUPEL  DEFINITION  *****/
{ Attr_pt boat[MAXATTRNO+1]; /** Begin-of-attributes array **/
    char info[MAXTUPLESIZE]; /** Information  !! OVERLAYED WITH bo_attr !!*/
    double doublealign; /* just for alignment, never used */
} Tuple;

typedef long Timeout;

typedef long State;
typedef long Id;


#define MAX_QUERY_CNT 21 /* 20+2 */



#define MAX_TA 10
#define MAX_DB 20 /* also used for TransbaseD, max capacity 
											in catman is 256 (Smallint) */

#define CONS_1 1
#define CONS_2 2
#define CONS_3 3
#define DROPTABLE 1
#define DROPINDEX 2
#define CREATETABLE 3
#define CREATEINDEX 4
#define CREATEVIEW 5
#define DROPVIEW 8
#define DROPDOMAIN 6
#define CREATEDOMAIN 7
#define GRANT_ACCESS 9
#define GRANT_PRIVILEGE 10
#define REVOKE_ACCESS 11
#define REVOKE_PRIVILEGE 12

#define PASSWORD 14
#define FOREIGN_PASSWORD 15

#define DDLCL FOREIGN_PASSWORD

#define ALTERTABLE_ADDCOL 110 /* nicht einsortiert  ddl_class */
#define ALTERTABLE_DROPCOL 111
#define ALTERTABLE_SETDEFAULT 112
#define ALTERTABLE_DROPDEFAULT 113
#define ALTERTABLE_ADDCONSTR 114
#define ALTERTABLE_DROPCONSTR 115
#define ALTERDOMAIN_SETDEFAULT 116
#define ALTERDOMAIN_DROPDEFAULT 117
#define ALTERDOMAIN_ADDCONSTR 118
#define ALTERDOMAIN_DROPCONSTR 119
#define CREATESEQUENCE 120
#define DROPSEQUENCE 121

#define CREATEEXTERNAL 122
#define CREATEEXTSRC 123
#define ALTEREXTERNAL 124
#define ALTEREXTSRC 125
#define COREXTERNAL 126 /* Create Or Replace */
#define CREATEFUNCTION 127
#define CREATEPROCEDURE 128
#define CREATETRIGGER 129
#define ALTERFUNCTION 130
#define ALTERPROCEDURE 131
#define CREATEORREPLACE 133
#define CORFUNCTION 134
#define CORPROCEDURE 135
#define CORTRIGGER 136
#define DROPEXTERNAL 137
#define DROPPROCEDURE 138
#define DROPFUNCTION 139
#define DROPTRIGGER 140
#define CALL_TYPE 141
#define GRANTEXTERNAL 142
#define REVOKEEXTERNAL 143
#define GRANTPROCFUNC 144
#define REVOKEPROCFUNC 145 /* adapt ddl_class if new entries are added */

#define SPOOL_FILE 21
#define SPOOL_RELATION 22

#define SPCL SPOOL_RELATION


#define UPD_POS_TYPE 29
#define DEL_POS_TYPE 30

#define POSICL DEL_POS_TYPE


#define INS_TYPE 31
#define DEL_TYPE 32
#define UPD_TYPE 33

#define DMLCL UPD_TYPE

#define SEL_TYPE 41
#define SEL_FOR_UPD 42

#define MQLCL SEL_FOR_UPD

#define LOCK 51
#define UNLOCK 52

#define LCKCL UNLOCK

#define LOAD_TABLE 60
#define LOAD_INDEX 61
#define LOAD_DEFAULT 62
#define LOAD_BY_QUERY 63
#define LOAD_SWITCH_ON 64
#define LOAD_SWITCH_OFF 65
#define UNLOAD_TABLE 66
#define UNLOAD_INDEX 67
#define UNLOAD_ALL 68

#define LOADCL UNLOAD_ALL


#define ddl_class(type) (((type) >= DROPTABLE && (type) <= DDLCL) || ((type) >= ALTERTABLE_ADDCOL && (type) <= REVOKEPROCFUNC))
#define dml_class(type) ((type) >=INS_TYPE && (type) <= DMLCL)

#define spool_class(type) ((type) >=SPOOL_FILE && (type) <= SPCL)
#define upd_class(type) (dml_class(type))
#define sel_class(type) ((type) >=SEL_TYPE && (type) <= MQLCL || (type)==CALL_TYPE)
#define lock_class(type) ((type) >=LOCK && (type) <= LCKCL)
#define load_class(type) ((type) >=LOAD_TABLE && (type) <= LOADCL)
#define posi_class(type) ((type) >=UPD_POS_TYPE && (type) <= POSICL)


#define is_select(type) (sel_class(type))

#define ill_class(type) (!sel_class(type) && !ddl_class(type) && !spool_class(type) && !lock_class(type) && !load_class(type) && !upd_class(type) && !posi_class(type))
/*********** Requests to TRANSBASE ****************/

#define TB__CONNECT 1 /* begin session */
#define TB__DISCONNECT 2 /* end session */
#define TB__LOGIN 3
#define TB__BT 4 /* begin transaction */
#define TB__CT 5 /* commit transaction */
#define TB__AT 6 /* abort transaction */

#define TB__DML 7 /* MQL-Statement */
#define TB__GENTREE 8 /* Open query with relalgterm */
#define TB__RUN 9 /* DDL-Statement and single step
					   statements */
#define TB__CLOSE 10 /* Close evaluation of (SELECT-)Statement */

#define TB__EVAL 11 /* Evaluate compiled mql-statement */
#define TB__DELPOS 12
#define TB__UPDPOS 13

#define TB__GET_TA_STATE 14
#define TB__GET_DB_STATE 15
#define TB__GET_QU_STATE 16
#define TB__SET_TIME_OUT 17
#define TB__SET_DAT_DIR 18
#define TB__GET_VERSION 19
#define TB__SET_CONSISTENCY 20
#define TB__CONTACTK 21
#define TB__ACCEPTK 22

#define TB__TESTCOMM 23

#define TB__OPEN_STORED 24
#define TB__RUN_STORED 25
#define TB__UPDPOS_STORED 26
#define TB__DELPOS_STORED 27
#define TB__STORE 28
#define TB__DROP_STORED 29
#define TB__DROP_ALLSTORED 30

#define TB__GETBLOB 31
#define TB__MAKEBLOB 32

#define TB__SET_SORTORDER 33
#define TB__GET_SORTORDER 34

#define TB__TBMODE 35

#define TB__SIG_HANDLE 36

#define TB__DUMP_REQ_START 37
#define TB__MCONNECT 38

#define TB__SEND_EVENT 39





#define TB__GET_TBX_STATE 41
#define TB__MYCONNECT 42
#define TB__GETFILEREF 43
#define TB__CURSOROPEN 44
#define TB__CURSOROPENSTORED 45
#define TB__CURSORFETCH 46

#define TB__CODEPAGE 47
#define TB__GET_CHARMAP 48
#define TB__GETBLOB_PART 49
#define TB__GETCONNATTR 50
#define TB__GETPLAN 51

#define RECEIVE_REQUEST (1<<13)
#define SEND_REQUEST (1<<14)

/* flags for cursors at compilation or activation time */
#define CURSOR_INSENSITIVE (1<<0)
#define CURSOR_SCROLLABLE (1<<1)

#define CURSOR_POS_REL 1
#define CURSOR_POS_ABS 2

#define DB_DCONN 1
#define DB_CONN 2
#define DB_KILLED 3
#define DB_LOGGED 4
#define DB_CONTACTED 5

#define DBACTIVE(state) ((state)==DB_LOGGED || (state)==DB_CONN)

#define QU_ACTIVE 1
#define QU_NOT_ACTIVE 2


#define CPG_INVALID 0
#define CPG_TEST 1
#define CPG_PROPRIET 2
#define CPG_ASCII 3
#define CPG_SINGLEBYTE 4
#define CPG_UTF8 5
#define CPG_EUC 6
#define CPG_JIS 7


/************* signs *****************/
#define UNSIGNEDS ((char)0) /* not SIGNED SIGN */
#define PLUSS ((char)1) /* indicates a pos. timespan */
#define MINUSS ((char)2) /* indicates a neg. timespan */
#define JULS ((char)3)
        /* JUL Sign indicates that datetime  lies in JULIAN period */

#define GREGS ((char)4)
        /* GREG Sign indicates that datetime lies in GREGORIAN period */


#define LOWFMASK (0x0000000F)
#define HIGHFMASK (0x000000F0)
#define SIGNMASK (0x00000F00)

#define dtgetlowf(t) ((t)->qual & LOWFMASK)
#define dtgethighf(t) (((t)->qual & HIGHFMASK)>>4)
#define dtgetsign(t) (((t)->qual & SIGNMASK)>>8)
#define dtsetlowf(t,v) ((t)->qual = ((t)->qual&~LOWFMASK)|(v))
#define dtsethighf(t,v) ((t)->qual = ((t)->qual&~HIGHFMASK)|((v)<<4))
#define dtsetsign(t,v) ((t)->qual = ((t)->qual&~SIGNMASK)|((v)<<8))
#define compno_dt_ts(dt) (dtgethighf((Datetime TBXFAR *)(dt)) - dtgetlowf((Datetime TBXFAR *)(dt)) + 1)

#define dtcomponent(t,comp) ((t)->val[(comp)-dtgetlowf(t)])

/*************   C-machine data types of tuple attributes **********/


typedef Int4 Integer;
#define PREC_INTEGER 10
typedef Int2 Smallint;
#define PREC_SMALLINT 5
typedef Int1 Tinyint;
#define PREC_TINYINT 3
typedef float Float;
typedef char String[MAXSTRINGSIZE];
typedef double Double;
typedef Double Real;

typedef char Bool;

/**  type NUMERIC  **/

/* Attention: if MAXPREC is increased then we get problems with
   Ubfield_info for Hypercube because it used the original size in
   Ubfield_info (appears in description page - also compare ub_init
   where a sizeof test appears (Datetime) */
#define MAXPREC 30
typedef struct
{
   char bcd[(MAXPREC+1)/2 + 2]; /* contains prec,scale, then 
				    BCD-digits in reversed order */
} Numeric;

#define MAXNUMSTRING (MAXPREC+3)
#define MAXFIX (MAXNUMSTRING)

/**  type DATETIME/TIMESPAN  **/

#define MAXQUAL 7 /* 7 elements in [MS:YY]  */
typedef struct
{
   long qual; /* sign: PLUSS, MINUSS */
   short val[MAXQUAL]; /* array of datetime field short VALues */
} Datetime; /* order from low to high, from the least */
                           /* significant to the most significant */
typedef struct
{
   long qual; /* sign: PLUSS, MINUSS */
   long val[MAXQUAL]; /* Timespan field long VALues */
} Timespan; /* order from the least */

/**  type BINCHAR  **/

typedef Int4 Bincharlen;
#define MAXBINCHAR (MAXATTRSIZE-(int)sizeof(Bincharlen))
typedef struct
{
   Bincharlen length; /* length of array: no \0  */
   char binchar[MAXBINCHAR];
} Binchar;

#define BINCHARARR(b) ( ((Binchar TBXFAR *)(b))->binchar)
#define BINCHARLEN(b) ( ((Binchar TBXFAR *)(b))->length)
#define ASCIMAXBINCHAR (MAXBINCHAR*2+3)


/**  type BITSS  **/

typedef Int4 Bitslen;
typedef Uint2 Bits2len;

/* internal size of Bits array */
#define MAXBITS (MAXATTRSIZE-(int)sizeof(Bitslen))

/* maximum value of "p"  in SQL type BITS(p) */
#define MAXUSERBITS (MAXBITS * 8)

typedef struct
{
   Bitslen length; /* number of bits, not bytes */
   unsigned char bits[MAXBITS];
} Bits;
#define BITS_TO_BYTE(b) (((b)+7)/8) /* b bits in bytes */

#define BITSARR(b) ( ( ((Bits TBXFAR *)(b))->bits))
#define BITSLEN(b) ( ((Bits TBXFAR *)(b))->length)
#define BITSLEN_BYTE(b) (BITS_TO_BYTE(BITSLEN(b))) /* used area bytes */

#define BINCHARLEN_TOT(b) (BINCHARLEN(b)+(int)sizeof(Bincharlen))
#define BITSLEN_TOT(b) (BITSLEN_BYTE(b)+(int)sizeof(Bitslen))

/* for UBTREE_VARIANT only */
/****  type Bits2 used as Ub_value   **/
/* is like Bits, but with short as length indicator */

typedef struct
{
   Bits2len length; /* number of bits, not bytes */
   unsigned char bits[MAXBITS];
} Bits2;
typedef Bits2 Ub_value;
#define UBVALUEARR(ub) ( ( ((Ub_value TBXFAR *)(ub))->bits))
#define UBVALUELEN(ub) ( ((Ub_value TBXFAR *)(ub))->length)
#define UBVALUELEN_BYTE(ub) (BITS_TO_BYTE(UBVALUELEN(ub))) /* used area bytes */
#define UBVALUELEN_TOT(ub) ((char*)&(UBVALUEARR(ub)[UBVALUELEN_BYTE(ub)]) - (char*)(ub))
#define BITS2ARR(bs) ( ( ((Bits2 TBXFAR *)(bs))->bits))
#define BITS2LEN(bs) ( ((Bits2 TBXFAR *)(bs))->length)
#define BITS2LEN_BYTE(bs) (BITS_TO_BYTE(BITS2LEN(bs))) /* used area bytes */
#define BITS2LEN_TOT(bs) ((char*)&(BITS2ARR(bs)[BITS2LEN_BYTE(bs)]) - (char*)(bs))
   /* this is more complicated than BITSLEN_TOT because of 
      possible alignment of a bad compiler (char[] after 2 byte int 
      should not be aligned) */
/* to store min and max values for a UB-indexed field in Col_desc and
   in B-tree description page in TransBase internal form, we use 
   maximum of value size for the supported data types (may change! ) */

#define MAXSIZE_UBVALUE_SOURCE_OLD sizeof(Numeric) /* may change! */
typedef Int4 Internal_ubsource_old[1+MAXSIZE_UBVALUE_SOURCE_OLD/sizeof(Int4)];

/* we now also support Datetime .. , see also test in ub_init */
#define MAXSIZE_UBVALUE_SOURCE sizeof(Datetime)
typedef Int4 Internal_ubsource[(MAXSIZE_UBVALUE_SOURCE+3)/sizeof(Int4)];
/*  end for UBTREE_VARIANT only */



/**  type BLOB  **/
typedef Uint4 High_Addr;
typedef Uint2 Low_Addr;

typedef struct {
    High_Addr haddr; /* high address part */
    Low_Addr laddr; /* low address part */
    Uint1 connid; /* for BLOB access in TransbaseD: 
    			   0 : local BLOB
			   >0: connection id for remote DB */
    FILLER_1(d1)
} L_Addr;
typedef High_Addr S_Addr;

typedef struct {
    Sno segno;
    char stype;
    Dev dev;
    char checksum_1; /* in page headers, 2 bytes used for checksum */
    char checksum_2;
} Segid;

typedef struct {
    Segid segid;
    L_Addr laddr;
} Blobadr;

typedef struct {
    unsigned long size; /* size of BLOB object */
    Blobadr blobadr;
} Blob; /* this is the type of a BLOB as it appears in a tuple
		  attribute; 
		  for internal use: if blobadr.laddr.haddr is SNO_UNDEF
		  (0) then blobadr.laddr.laddr is an internal identifier
		  for a OS file where BLOB is stored */

/* tbadmlib_incl_type_end */

/* tbx_incl_const_begin tbadmlib_incl_const_begin */
#define PASSLEN MAXIDENTSIZE
#define DBPATHLEN 256
#define DBNAMLEN 128
/* tbx_incl_const_end tbadmlib_incl_const_end */

typedef char Passwd[PASSLEN+1];

typedef int *TbPtr;

/* tbadmlib_incl_type_begin */

typedef char Login[PASSLEN+1];





typedef char Dbname[DBNAMLEN+1];


typedef char Dbhost[DBNAMLEN+1];
typedef char Dbpath[DBPATHLEN+1];
/* tbadmlib_incl_type_end */

/* structure for a complete object name 
	(tables,indexes,domains,constraints) */
typedef struct
{ char schname[MAXSCHEMA+1]; /* schema name */
    char uqname[MAXIDENTSIZE+1]; /* object name */
    Dbname dbname; /* remote dbname */
    Dbhost dbhost; /* remote dbhost */
} Qname; /* qualified name */

typedef struct {
    int mode; /* MMADR or FILENAME */
    unsigned long size;
    union {
            char TBXFAR *filename;
            struct {
                     short usrmalloc; /* 0 or 1 */
                     unsigned mallocsize;
                     char TBXFAR *mmadr; /* main memory address  **/
                   } mmem;
           } loc;
} Blobdesc;

/*************  end C-machine data types of tuple attributes **********/


/* parametertype  for procedure ipr_tuplecmp   */

typedef Int2 Attrcode;
typedef Int2 Attrpos;
typedef struct
{ Int2 attr_pos; /* field position in tupel */
   Attrcode attr_type; /* type description */
} TupCompelem; /* field of attribute descriptions */

typedef struct
{ Int2 nattr; /* number of fields to compare */
   TupCompelem field[MAXATTRNO]; /* description of field to compare */
} TupComp;

#define tb_tuplecmp(tup0,tup1,d0,d1) (ipr_tuplecmp(tup0,tup1,d0,d1,NULL))

typedef union
{ struct
   { char prec;
        char scale;
   } ps; /* for NUMERIC */
   struct
   { char lowf;
        char highf;
   } lh; /* for DATETIME/TIMESPAN */
   short strprec; /* for CHAR[]/STRING */
} Tspec;
        /* fine type specification for CHAR/NUMERIC/DATE/TIME */
typedef struct
{ Attrcode code;
   Tspec tspec;
   Bool notnull; /* used in optree:
   			FALSE: NULL's may arrive;  TRUE: noNULLS */
} Attrtype;


typedef struct
{
   Int4 ntuples;
   Int4 tried;
} Count_result;


#define NO_TUPLE (0)
#define ONE_TUPLE (1)
#define MORE_TUPLES (2)

typedef struct
{
   char unnamed; /* fieldname generated by DB ? */
   short fieldtype;
   Tspec tspec; /* fine type specification */
   char fieldname[MAXIDENTSIZE+1];




   char TBXFAR *fieldpointer;
} Field;

typedef struct {
    short fieldtype;
    Tspec tspec;
} Par_descr;

typedef struct
{
   Id query_id; /* identifier of the open mql-query */
   short eod;
   short qtype;
   short updatable; /* for (not)updatable select queries */
   short qattr_no; /* number of attr's in  result-tuple */
   short param_no; /* number of param's in  query */
   Field TBXFAR *field; /* for each result-attribute */
   Par_descr TBXFAR *params; /* for each parameter */
} Query_descr; /* Description of an open query */


typedef struct
{
   short qtype;
   short eod;
   union{
           char tuple[MAXTUPLESIZE];
           Count_result count;
           Double doublealign; /* just for alignment */
        }_var;
} Result;


typedef struct{
        short type;
        char TBXFAR *value;
} Param;

typedef struct{
        short param_no;
        Param TBXFAR *param;
} Parameters;






#if USE_PROTOTYPES == 1
typedef int (DLLEXPORT TbxCallback)(void);
typedef TbxCallback *PTbxCallback;
int DLLEXPORT fixgetsign(Numeric TBXFAR *);
int DLLEXPORT getsign(Numeric TBXFAR *);
int DLLEXPORT getscale(Numeric TBXFAR *);
int getdigit(Numeric *,int );
Numeric TBXFAR * DLLEXPORT fixmkzero(Numeric TBXFAR *);
int DLLEXPORT fixiszero(Numeric TBXFAR *);
Numeric TBXFAR * DLLEXPORT fixminus(Numeric TBXFAR *,
                                Numeric TBXFAR *);
Numeric TBXFAR * DLLEXPORT fixcopy(Numeric TBXFAR *,
                                Numeric TBXFAR *);
int DLLEXPORT fixcmp(Numeric TBXFAR *,
                                Numeric TBXFAR *);
Error DLLEXPORT double_fix(double ,int ,
                                Numeric TBXFAR *);
Numeric TBXFAR * DLLEXPORT long_fix(long ,unsigned ,
                                Numeric TBXFAR *);
Error DLLEXPORT scan_fix(char TBXFAR *,
                                Numeric TBXFAR *,unsigned TBXFAR *);
Numeric TBXFAR * DLLEXPORT fix_fix(Numeric TBXFAR *,
                                unsigned ,Numeric TBXFAR *);
double DLLEXPORT fix_double(Numeric TBXFAR *);
Error DLLEXPORT fix_long(Numeric TBXFAR *,
                                long TBXFAR *);
char TBXFAR * DLLEXPORT fix_string(Numeric TBXFAR *,
                                char TBXFAR *);
Error DLLEXPORT fixadd(Numeric TBXFAR *,
                                Numeric TBXFAR *,Numeric TBXFAR *);
Error DLLEXPORT fixsub(Numeric TBXFAR *,
                                Numeric TBXFAR *,Numeric TBXFAR *);
Error DLLEXPORT fixmul(Numeric TBXFAR *,
                                Numeric TBXFAR *,Numeric TBXFAR *);
Error DLLEXPORT fixdiv(Numeric TBXFAR *,
                                Numeric TBXFAR *,Numeric TBXFAR *);
int DLLEXPORT getprec(Numeric TBXFAR *);
Error DLLEXPORT set_current(void);
Error DLLEXPORT dt_current (Datetime TBXFAR *);
Error DLLEXPORT dt_weekday (Datetime TBXFAR *,int TBXFAR *);
void DLLEXPORT dt_copy (Datetime TBXFAR *,Datetime TBXFAR *);
void DLLEXPORT ts_copy (Timespan TBXFAR *,Timespan TBXFAR *);
Error DLLEXPORT dt_cast (Datetime TBXFAR *,Datetime TBXFAR *,int ,int );
Error DLLEXPORT ts_cast (Timespan TBXFAR *,Timespan TBXFAR *,int ,int );
int DLLEXPORT dt_cmp (Datetime TBXFAR *,Datetime TBXFAR *);
Error DLLEXPORT ts_getsign(Timespan TBXFAR *);
Error DLLEXPORT ts_cmp (Timespan TBXFAR *,Timespan TBXFAR *,int TBXFAR *);
Error DLLEXPORT ts_add (Timespan TBXFAR *,Timespan TBXFAR *,Timespan TBXFAR *);
Error DLLEXPORT ts_sub (Timespan TBXFAR *,Timespan TBXFAR *,Timespan TBXFAR *);
Error DLLEXPORT ts_mul (Timespan TBXFAR *,long ,Timespan TBXFAR *);
Error DLLEXPORT ts_div (Timespan TBXFAR *,long ,Timespan TBXFAR *);
Error DLLEXPORT dt_sub (Datetime TBXFAR *,Datetime TBXFAR *,Timespan TBXFAR *);
Error DLLEXPORT dt_ts_add (Datetime TBXFAR *,Timespan TBXFAR *,Datetime TBXFAR *);
Error DLLEXPORT dt_ts_sub (Datetime TBXFAR *,Timespan TBXFAR *,Datetime TBXFAR *);
void DLLEXPORT ts_change_sign(Timespan TBXFAR *);
char TBXFAR * DLLEXPORT dt_str (char TBXFAR *,Datetime TBXFAR *);
char TBXFAR * DLLEXPORT ts_str (char TBXFAR *,Timespan TBXFAR *);
Error DLLEXPORT dt_check(Datetime TBXFAR *);
Error DLLEXPORT ts_check(Timespan TBXFAR *);
char TBXFAR * DLLEXPORT tb_dt_format (char TBXFAR *,char TBXFAR *,Datetime TBXFAR *);
char TBXFAR * DLLEXPORT tb_ts_format (char TBXFAR *,char TBXFAR *,Timespan TBXFAR *);
char TBXFAR * DLLEXPORT tb_dt_date (char TBXFAR *,int ,Datetime TBXFAR *);
char TBXFAR * DLLEXPORT tb_dt_time (char TBXFAR *,int ,Datetime TBXFAR *);
char TBXFAR * DLLEXPORT tb_dt_dt (char TBXFAR *,int ,Datetime TBXFAR *);
char TBXFAR * DLLEXPORT tb_ts_timespan(char TBXFAR *,int ,Timespan TBXFAR *);
char TBXFAR * DLLEXPORT binchar_to_string(char TBXFAR *,Binchar TBXFAR *,long );
char TBXFAR * DLLEXPORT bits_to_string(char TBXFAR *,Bits TBXFAR *,long );
char TBXFAR * DLLEXPORT bits2_to_string(char TBXFAR *,Bits2 TBXFAR *, long);
int atonumber(char *,long *,char **);
 Error TBXFAR tbx(int , ...);
Error DLLEXPORT TbxCursorOpen(Id ,Id ,char TBXFAR *,Query_descr TBXFAR *, unsigned long);
Error DLLEXPORT TbxCursorFetch(Query_descr TBXFAR *, int, long,long TBXFAR *,long TBXFAR *);
Error DLLEXPORT TbxCursorOpenStored(Id ,Id ,Id ,Parameters TBXFAR *,Query_descr TBXFAR *,unsigned long);
Error DLLEXPORT TbxInterrupt(State TBXFAR *);
Error DLLEXPORT TbxConnect(char TBXFAR *,Id TBXFAR *);
Error DLLEXPORT TbxMultiConnect(char TBXFAR *,Id TBXFAR *);
Error DLLEXPORT TbxDisconnect(Id ,State TBXFAR *);
Error DLLEXPORT TbxLogin(Id ,char TBXFAR *,char TBXFAR *);
Error DLLEXPORT TbxBt(Id TBXFAR *);
Error DLLEXPORT TbxCt(Id ,State TBXFAR *);
Error DLLEXPORT TbxAt(Id ,State TBXFAR *);
Error DLLEXPORT TbxDml(Id ,Id ,char TBXFAR *,Query_descr TBXFAR *);
Error DLLEXPORT TbxRun(Id ,Id ,char TBXFAR *,Query_descr TBXFAR *,Result TBXFAR *);
Error DLLEXPORT TbxClose(Query_descr TBXFAR *);
Error DLLEXPORT TbxEval(Query_descr TBXFAR *,Result TBXFAR *);
Error DLLEXPORT TbxDelPos(Query_descr TBXFAR *);
Error DLLEXPORT TbxUpdPos(Query_descr TBXFAR *,char TBXFAR *);
Error DLLEXPORT TbxGetTaState(Id ,State TBXFAR *);
Error DLLEXPORT TbxGetDbState(Id ,State TBXFAR *);
Error DLLEXPORT TbxGetQuState(Id ,State TBXFAR *);
Error DLLEXPORT TbxSetTimeout(Timeout );
Error DLLEXPORT TbxSetDatDir(Id ,char TBXFAR *);
Error DLLEXPORT TbxVersion(Id ,char TBXFAR *);
Error DLLEXPORT TbxSetConsistency(int );
Error DLLEXPORT TbxContact(char TBXFAR *,Id TBXFAR *);
Error DLLEXPORT TbxAccept(Id );
Error DLLEXPORT TbxOpenStored(Id ,Id ,Id ,Parameters TBXFAR *,Query_descr TBXFAR *);
Error DLLEXPORT TbxRunStored(Id ,Id ,Id ,Parameters TBXFAR *,Query_descr TBXFAR *,Result TBXFAR *);
Error DLLEXPORT TbxUpdPosStored(Query_descr TBXFAR *,Id ,Parameters TBXFAR *);
Error DLLEXPORT TbxDelPosStored(Query_descr TBXFAR *,Id );
Error DLLEXPORT TbxStore(Id ,char TBXFAR *,Id TBXFAR *,Query_descr TBXFAR *);
Error DLLEXPORT TbxDropStored(Id ,Id );
Error DLLEXPORT TbxDropAllStored(Id );
Error DLLEXPORT TbxGetBlob(Id ,Id ,Blob TBXFAR *,Blobdesc TBXFAR *);
Error DLLEXPORT TbxGetBlobPart(Id ,Id ,Blob TBXFAR *,Blobdesc TBXFAR *, long, long);
Error DLLEXPORT TbxMakeBlob(Id ,Id ,char TBXFAR *,Blobdesc TBXFAR *);
Error DLLEXPORT TbxSetSortOrder(Id ,unsigned char TBXFAR *);
Error DLLEXPORT TbxGetSortOrder(Id ,unsigned char TBXFAR *);
Error DLLEXPORT TbxTbmode(Id ,char TBXFAR *);
Error DLLEXPORT TbxDumpReqStart(Id ,Id );
Error DLLEXPORT TbxSendEvent(Id ,char TBXFAR *, char TBXFAR *, char TBXFAR * );
Error DLLEXPORT TbxCodePage(Id, short TBXFAR *);
Error DLLEXPORT TbxGetConnectionAttribute(Id, char TBXFAR *, char TBXFAR *);
Error DLLEXPORT TbxGetFileRef(Id, Id, char TBXFAR *, Blobdesc TBXFAR *);
Error DLLEXPORT TbxGetTbxState(State);
Error DLLEXPORT TbxMyriadConnect(char TBXFAR *, Id TBXFAR *);
Error DLLEXPORT TbxTestComm(Id, char TBXFAR *);
Error DLLEXPORT TbxGetCharmap(Id, long TBXFAR *);
Error DLLEXPORT TbxAbortCallback(PTbxCallback);
Error DLLEXPORT TbxGetPlan(Id, char TBXFAR *, char TBXFAR *);
char TBXFAR * TBXFAR tb_errtxt_adr(void);
#else
typedef int (DLLEXPORT TbxCallback)();
typedef TbxCallback *PTbxCallback;
int DLLEXPORT fixgetsign();
int DLLEXPORT getsign();
int DLLEXPORT getscale();
int getdigit();
Numeric TBXFAR * DLLEXPORT fixmkzero();
int DLLEXPORT fixiszero();
Numeric TBXFAR * DLLEXPORT fixminus();
Numeric TBXFAR * DLLEXPORT fixcopy();
int DLLEXPORT fixcmp();
Error DLLEXPORT double_fix();
Numeric TBXFAR * DLLEXPORT long_fix();
Error DLLEXPORT scan_fix();
Numeric TBXFAR * DLLEXPORT fix_fix();
double DLLEXPORT fix_double();
Error DLLEXPORT fix_long();
char TBXFAR * DLLEXPORT fix_string();
Error DLLEXPORT fixadd();
Error DLLEXPORT fixsub();
Error DLLEXPORT fixmul();
Error DLLEXPORT fixdiv();
int DLLEXPORT getprec();
Error DLLEXPORT set_current();
Error DLLEXPORT dt_current ();
Error DLLEXPORT dt_weekday ();
void DLLEXPORT dt_copy ();
void DLLEXPORT ts_copy ();
Error DLLEXPORT dt_cast ();
Error DLLEXPORT ts_cast ();
int DLLEXPORT dt_cmp ();
Error DLLEXPORT ts_getsign();
Error DLLEXPORT ts_cmp ();
Error DLLEXPORT ts_add ();
Error DLLEXPORT ts_sub ();
Error DLLEXPORT ts_mul ();
Error DLLEXPORT ts_div ();
Error DLLEXPORT dt_sub ();
Error DLLEXPORT dt_ts_add ();
Error DLLEXPORT dt_ts_sub ();
void DLLEXPORT ts_change_sign();
char TBXFAR * DLLEXPORT dt_str ();
char TBXFAR * DLLEXPORT ts_str ();
Error DLLEXPORT dt_check();
Error DLLEXPORT ts_check();
char TBXFAR * DLLEXPORT tb_dt_format ();
char TBXFAR * DLLEXPORT tb_ts_format ();
char TBXFAR * DLLEXPORT tb_dt_date ();
char TBXFAR * DLLEXPORT tb_dt_time ();
char TBXFAR * DLLEXPORT tb_dt_dt ();
char TBXFAR * DLLEXPORT tb_ts_timespan();
char TBXFAR * DLLEXPORT binchar_to_string();
char TBXFAR * DLLEXPORT bits_to_string();
char TBXFAR * DLLEXPORT bits2_to_string();
int atonumber();
 Error TBXFAR tbx();
Error DLLEXPORT TbxCursorOpen();
Error DLLEXPORT TbxCursorFetch();
Error DLLEXPORT TbxCursorOpenStored();
Error DLLEXPORT TbxInterrupt();
Error DLLEXPORT TbxConnect();
Error DLLEXPORT TbxMultiConnect();
Error DLLEXPORT TbxDisconnect();
Error DLLEXPORT TbxLogin();
Error DLLEXPORT TbxBt();
Error DLLEXPORT TbxCt();
Error DLLEXPORT TbxAt();
Error DLLEXPORT TbxDml();
Error DLLEXPORT TbxRun();
Error DLLEXPORT TbxClose();
Error DLLEXPORT TbxEval();
Error DLLEXPORT TbxDelPos();
Error DLLEXPORT TbxUpdPos();
Error DLLEXPORT TbxGetTaState();
Error DLLEXPORT TbxGetDbState();
Error DLLEXPORT TbxGetQuState();
Error DLLEXPORT TbxSetTimeout();
Error DLLEXPORT TbxSetDatDir();
Error DLLEXPORT TbxVersion();
Error DLLEXPORT TbxSetConsistency();
Error DLLEXPORT TbxContact();
Error DLLEXPORT TbxAccept();
Error DLLEXPORT TbxOpenStored();
Error DLLEXPORT TbxRunStored();
Error DLLEXPORT TbxUpdPosStored();
Error DLLEXPORT TbxDelPosStored();
Error DLLEXPORT TbxStore();
Error DLLEXPORT TbxDropStored();
Error DLLEXPORT TbxDropAllStored();
Error DLLEXPORT TbxGetBlob();
Error DLLEXPORT TbxGetBlobPart();
Error DLLEXPORT TbxMakeBlob();
Error DLLEXPORT TbxSetSortOrder();
Error DLLEXPORT TbxGetSortOrder();
Error DLLEXPORT TbxTbmode();
Error DLLEXPORT TbxDumpReqStart();
Error DLLEXPORT TbxSendEvent();
Error DLLEXPORT TbxCodePage();
Error DLLEXPORT TbxGetConnectionAttribute();
Error DLLEXPORT TbxGetFileRef();
Error DLLEXPORT TbxGetTbxState();
Error DLLEXPORT TbxMyriadConnect();
Error DLLEXPORT TbxTestComm();
Error DLLEXPORT TbxGetCharmap();
Error DLLEXPORT TbxAbortCallback();
Error DLLEXPORT TbxGetPlan();
char TBXFAR * TBXFAR tb_errtxt_adr();
#endif
#ifdef __cplusplus
}
#endif
#endif

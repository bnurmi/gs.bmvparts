/******************************************************** 

                      T r a n s B a s e / C D
  @(#) tbadmsdk.h:   V6.1.2.19 (Build 404)
		Project: 4.119.1.19
		2004/08/05 11:46:57

  Copyright (c) 1995 - 
  Transaction Software GmbH
  D 81739 Munich 

 *********************************************************/

/* Module begin */
#ifndef _TBADMLIB_H
#define _TBADMLIB_H

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


#pragma pack(1)


#define MAXIDENTSIZE 31
#define PASSLEN MAXIDENTSIZE
#define DBPATHLEN 256
#define DBNAMLEN 128

#define MAX_VOLID (32) /* max. size of volume Id-string */

#define INTR_BY_USER 30 /* User typed ^C                         */
#define KERNEL_PROBLEM 31 /* Problems in Database Kernel           */
#define ILLEGAL_USAGE 32 /* Illegal Usage                         */
#define INIT_ERR 33 /* Error in Initialization phase         */
#define NO_TBVAR 34 /* TransBase variable not set            */
#define MESSAGE_INIT 35 /* Problem while reading messages        */
#define NOT_ALLOWED 36 /* Operation not allowed                 */
#define UNDEF_DATABASE 37 /* Undefined databasename                */
#define UNNORMAL_ERROR 38 /* Something confusing has happened      */
#define NOT_BOOTED 39 /* Database cannot be booted             */
#define NOT_SHUTDOWN 40 /* Database cannot be shutdown           */
#define NOT_CONFIRMED 41 /* User did not confirm                  */
#define NOT_CREATED 42 /* Database not created                  */
#define PARAMETER_PROBLEM 43 /* Problem with unsound parameters       */
#define NOT_DELETED 44 /* Database not deleted                  */
#define NOT_ALTERED 45 /* Database not altered                  */
#define NOT_DUMPED 46 /* Database not dumped                   */
#define NOT_INSTALLED 47 /* Database not installed                */
#define DATABASE_EXISTS 48 /* Database does already excists         */
#define UNSOUND_SECFILE 49 /* Errors in security classes            */
#define PATH_PROBLEM 50 /* Problem in building path or filenames */
#define NO_LICENSE 51 /* No Licensenumber found                */
#define DBS_OVERFLOW 52 /* More than one database (VMS only)     */

#define STATIST_FIX 1
#define STATIST_DISK 2
#define STATIST_LOG 4
#define STATIST_BFIM 8
#define STATIST_SCRATCH 16
#define STATIST_COMPR 32
#define STATIST_ROM 64
#define STATIST_TA 128
#define STATIST_SEMA 256
#define STATIST_BBPAGE 512
#define STATIST_IOP 1024
#define STATIST_DYCL 2048
#define STATIST_ALL 4095

#define TBADM_API TB_API
#define KERNEL_BUSY 1
#define KERNEL_IDLE 2
#define KERNEL_NOTBX 3



typedef unsigned long Uint4;
typedef long Bno;
typedef Bno Sno;
typedef char Bool;

typedef char Login[PASSLEN+1];





typedef char Dbname[DBNAMLEN+1];


typedef char Dbhost[DBNAMLEN+1];
typedef char Dbpath[DBPATHLEN+1];

typedef struct{
   Dbhost d_host; /* host where the db resides on */
   Dbname d_name; /* Database Name */
   Dbpath d_path; /* home directory of db */
   Dbpath d_rompath; /* basic dir for romfiles */
   Dbpath d_scrpath; /* scratch directory */
   Dbpath d_drlpath; /* log files directory */
   Dbpath d_bfmpath; /* bfim directory */
   char d_volid[MAX_VOLID]; /* id string */
   Uint4 d_lcksize; /* size of lockmanagers shared memory */
   Uint4 d_segsize; /* size of segment managers shared memory */
   Uint4 d_totsize; /* total shared memory size */
   Uint4 d_loccsze; /* local cache size */
   long d_semkey; /* key of db's sempahore */
   long d_shmkey; /* key of db's shared memory */
   long d_id; /* db identifier */
   long d_drlsize; /* max size of 1 logfile [Bytes] */
   int d_booted; /* databases booted ? */
   int d_dbtype; /* DBMS_Type STD|EDITORIAL|RETRIEVAL */
   int d_nrcaches; /* number of global caches */
   long d_size_cache_partition_kb; /* size of one global cache */
   int d_nousr; /* number of concurrent users */
   int d_pagesize; /* db's pagesize in byte */
   int d_ta_p_db; /* number of concurrent ta's */
   int d_alignment; /* alignment value */
   Bno d_totdisksize; /* measured in pages */
   Bno d_totromsize; /* measured in pages */
   Dbpath d_acctfile; /* accountlog file */
   Uint4 d_acctevents; /* accounting events */
   int d_acct_on; /* accounting on/off */
   Bool d_drlon; /* for versions before LOGGING 
   				RECOVERY this is not in file,
					   just temporary flag */
   Bool d_myriad; /* is myriad archive ? */
   int d_minkernels; /* number of kernels at startup */
   int d_maxkernels; /* max number of multiplexed kernels */
   Bool d_case_insensitive;
   int d_codepage;
   char d_locale[64];
   Bool d_redirectjvm;
   Bool d_inmigration;
   Bool d_encrypted;
} Dbentry;


typedef struct{
        unsigned long magic;
        unsigned long flags;
        unsigned long act_time;

        unsigned long sfix_cnt; /* cache access for system pages */
        unsigned long sfix_frcnt; /* forced reads by sfix */
        unsigned long sfix_fwcnt; /* forced write by sfix */
        unsigned long sfix_fscnt; /* forced sync by sfix */

        unsigned long rfix_cnt; /* cache access for reading */
        unsigned long rfix_frcnt; /* forced reads by rfix */
        unsigned long rfix_fwcnt; /* forced write by rfix */
        unsigned long rfix_fscnt; /* forced sync by rfix */

        unsigned long wfix_cnt; /* cache access for writing */
        unsigned long wfix_frcnt; /* forced reads by wfix */
        unsigned long wfix_fwcnt; /* forced write by wfix */
        unsigned long wfix_fscnt; /* forced sync by wfix */

        unsigned long alloc_cnt; /* cache access for writing */
        unsigned long alloc_frcnt; /* forced reads by alloc */
        unsigned long alloc_fwcnt; /* forced write by alloc */
        unsigned long alloc_fscnt; /* forced sync by alloc */

        unsigned long disk_rcnt; /* read counter */
        unsigned long disk_wcnt; /* write counter */
        unsigned long disk_scnt; /* sync counter */

        unsigned long log_rcnt; /* deltalog read */
        unsigned long log_wcnt; /* deltalog write */
        unsigned long log_scnt; /* deltalog sync */

        unsigned long bfim_rcnt; /* bfim read */
        unsigned long bfim_wcnt; /* bfim write */
        unsigned long bfim_scnt; /* bfim sync */

        unsigned long scratch_wcnt; /* scratch read */
        unsigned long scratch_rcnt; /* scratch write */

        unsigned long comp_rcnt; /* compressed romfile read */
        unsigned long comp_wcnt; /* compressed romfile write */
        unsigned long comp_scnt; /* compressed romfile sync */

        unsigned long rom_rcnt; /* romfile read */
        unsigned long rom_wcnt; /* romfile write */
        unsigned long rom_scnt; /* romfile sync */

        unsigned long ta_commit; /* transactions commited */
        unsigned long ta_abort; /* transactions rolled back */

        unsigned long ssema_cnt; /* segman Semaphore op's */
        unsigned long lsema_cnt; /* lckman Semaphore op's */
        unsigned long iosema_cnt; /* iosema Semaphore op's */

        unsigned long io_wait; /* waiting for IOP */
        unsigned long io_request; /* request for IOP */
        unsigned long io_fetch; /* IOP  fetch */

        unsigned long acc_bbnode; /* access to a bbindex page */
        unsigned long acc_bbleaf; /* access to a bbleaf page */

        unsigned long nrins_fpg; /* inserts in full leaf page */
        unsigned long nrdins_fpg; /* dycl inserts in full leaf page */
        unsigned long nrdapp_fpg; /* dycl appends in full leaf page */
} TB_Statistic;

#define FRC_READ(t) (t->disk_rcnt+t->comp_rcnt+t->rom_rcnt+ t->log_rcnt+t->bfim_rcnt)

#define FRC_WRITE(t) (t->disk_wcnt+t->log_wcnt)
#define FRC_SYNC(t) (t->disk_scnt+t->log_scnt+t->bfim_scnt)


typedef struct{
        long size;
        long occupied;
        char TBXFAR *volpath;
} TbadmVolume;

typedef struct{
        int nrvol;
        TbadmVolume TBXFAR * tbadmvolume;
} TbadmVolumes;

typedef struct{
        long size;
        long occupied;
        char TBXFAR *rompath;
        char TBXFAR *comppath;
} TbadmRom;

typedef struct{
        int nrrom;
        TbadmRom TBXFAR *tbadmrom;
} TbadmRoms;

typedef struct{
        Dbhost d_host;
        Login d_username;
        long started;
        long processid;
        Bool ta_open;
        int state;
} TbadmConnInfo;

typedef struct{
        Dbentry dbentry;
        TbadmVolumes volumes;
        TbadmRoms romfiles;
        int noconnections;
        TbadmConnInfo *connections;
        char *dbnamelist;
}TbadmInfo;

#if USE_PROTOTYPES == 1
typedef Bool (DLLEXPORT TbadmMonitorCallback)(void TBXFAR *,
        void TBXFAR *, void TBXFAR *, int TBXFAR *);
typedef TbadmMonitorCallback *PTbadmMonitorCallback;

typedef Bool (DLLEXPORT TbadmCallback)(char TBXFAR *, char TBXFAR *, int, char TBXFAR *);
typedef TbadmCallback *PTbadmCallback;
Bool TBADM_API TbadmLoad(void);
Bool TBADM_API TbadmUnLoad(void);
Bool TBADM_API TbadmAttach(char TBXFAR *, char TBXFAR *, PTbadmCallback);
Bool TBADM_API TbadmCreate(char TBXFAR *, char TBXFAR *);
Bool TBADM_API TbadmMigrate(char TBXFAR *);
Bool TBADM_API TbadmAlter(char TBXFAR *, char TBXFAR *);
Bool TBADM_API TbadmDelete(char TBXFAR *, char TBXFAR *);
Bool TBADM_API TbadmBoot(char TBXFAR *, Bool);
Bool TBADM_API TbadmShutdown(char TBXFAR *, Bool);
Bool TBADM_API TbadmGetInfo(char TBXFAR *, char TBXFAR *, TbadmInfo TBXFAR* TBXFAR*);
Bool TBADM_API TbadmMonitor(char TBXFAR *, char TBXFAR *, PTbadmMonitorCallback);
Bool TBADM_API TbadmGetLastErrorCode(long TBXFAR *);
Bool TBADM_API TbadmGetLastErrorText(char TBXFAR * TBXFAR *);
Bool TBADM_API TbadmFlush(char TBXFAR *, char TBXFAR *);
typedef Bool (TbtarCallback)(char TBXFAR *, ...);
typedef TbtarCallback *PTbtarCallback;
Bool DLLEXPORT TbtarWrite(char TBXFAR *, char TBXFAR *, PTbtarCallback, PTbtarCallback);
Bool DLLEXPORT TbtarRead(char TBXFAR *, char TBXFAR *, PTbtarCallback, PTbtarCallback);
Bool DLLEXPORT TbtarGetLastErrorCode(long TBXFAR *);
Bool DLLEXPORT TbtarGetLastErrorText(char TBXFAR * TBXFAR *);
typedef Bool (TbarcCallback)(char TBXFAR *, ...);
typedef TbarcCallback *PTbarcCallback;
Bool DLLEXPORT TbarcWrite(char TBXFAR *, char TBXFAR *, char TBXFAR *, PTbarcCallback, PTbarcCallback);
Bool DLLEXPORT TbarcRead(char TBXFAR *, char TBXFAR *, char TBXFAR *, PTbarcCallback, PTbarcCallback);
Bool DLLEXPORT TbarcGetLastErrorCode(long TBXFAR *);
Bool DLLEXPORT TbarcGetLastErrorText(char TBXFAR * TBXFAR *);
#else
typedef Bool (DLLEXPORT TbadmMonitorCallback)();
typedef TbadmMonitorCallback *PTbadmMonitorCallback;
typedef int (DLLEXPORT TbadmCallback)();
typedef TbadmCallback *PTbadmCallback;
Bool TBADM_API TbadmLoad();
Bool TBADM_API TbadmUnLoad();
Bool TBADM_API TbadmAttach();
Bool TBADM_API TbadmCreate();
Bool TBADM_API TbadmMigrate();
Bool TBADM_API TbadmAlter();
Bool TBADM_API TbadmDelete();
Bool TBADM_API TbadmBoot();
Bool TBADM_API TbadmShutdown();
Bool TBADM_API TbadmGetInfo();
Bool TBADM_API TbadmMonitor();
Bool TBADM_API TbadmGetLastErrorCode();
Bool TBADM_API TbadmGetLastErrorText();
Bool TBADM_API TbadmFlush();
typedef Bool (TbtarCallback)();
typedef TbtarCallback *PTbtarCallback;
Bool DLLEXPORT TbtarWrite();
Bool DLLEXPORT TbtarRead();
Bool DLLEXPORT TbtarGetLastErrorCode();
Bool DLLEXPORT TbtarGetLastErrorText();
typedef Bool (TbarcCallback)();
typedef TbarcCallback *PTbarcCallback;
Bool DLLEXPORT TbarcWrite();
Bool DLLEXPORT TbarcRead();
Bool DLLEXPORT TbarcGetLastErrorCode();
Bool DLLEXPORT TbarcGetLastErrorText();
#endif
#ifdef __cplusplus
}
#endif
#endif

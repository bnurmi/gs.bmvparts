/******************************************************** 

                      T r a n s B a s e / C D
  @(#) tci.h:   V6.1.2.19 (Build 404)
		Project: 4.119.1.19
		2004/08/05 11:46:57

  Copyright (c) 1995 - 
  Transaction Software GmbH
  D 81739 Munich 

 *********************************************************/

/* Module begin */
#ifndef _TCI_H
#define _TCI_H

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
#include "tbx.h"
#ifdef _UNICODE
#include <wchar.h>
#endif


#pragma pack(1)


#define TCI_API TB_API
#define TCI_TYPE (0x0100) /* TCI types starting at 256 */
#define TCI_TYPE_UNSIGNED (0x0200) /* flag for unsigned types */
#define TCI_TYPE_DATE (0x0400) /* flag for date type */
#define TCI_TYPE_INTERVAL (0x0800) /* flag for interval type */
#define TCI_TYPE_SPECIAL (0x1000) /* has no Transbase corresponding type */
#define TCI_TYPE_WIDE (0x2000) /* is wide char type */
#define TCI_TYPE_SQL (0x4000) /* is a SQL type */
#define TCI_TYPE_UNUSED (0x8000) /* not used for the moment */

#define IS_TCI_TYPE(t) (((t) & 0xFFFF) & TCI_TYPE) /* t is a TCI type */
#define IS_TCI_UNSIGNED(t) (IS_TCI_TYPE(t) && ((t) & TCI_TYPE_UNSIGNED)) /* t is a TCI unsigned type */
#define IS_TCI_DATE(t) (IS_TCI_TYPE(t) && ((t) & TCI_TYPE_DATE)) /* t is a TCI date type, low/high in lower byte */
#define IS_TCI_INTERVAL(t) (IS_TCI_TYPE(t) && ((t) & TCI_TYPE_INTERVAL)) /* t is a TCI interval type, low/high in lower byte */
#define IS_TCI_SPECIAL(t) (IS_TCI_TYPE(t) && ((t) & TCI_TYPE_SPECIAL)) /* t is a TCI ODBC-like type */
#define IS_TCI_WIDE(t) (IS_TCI_TYPE(t) && ((t) & TCI_TYPE_WIDE)) /* t is a TCI wide char type */
#define IS_TCI_SQL(t) (IS_TCI_TYPE(t) && ((t) & TCI_TYPE_SQL)) /* t is a TCI SQL type */
#define IS_TCI_UNUSED(t) (IS_TCI_TYPE(t) && ((t) & TCI_TYPE_UNUSED)) /* t is a TCI unused type */

/* classification of types */
#define IS_TCI_NATURAL(t) ((t)==TCI_C_SINT1 || (t)==TCI_C_SINT2 || (t)==TCI_C_SINT4 || (t)==TCI_C_SINT8 || (t)==TCI_C_UINT1 || (t)==TCI_C_UINT2 || (t)==TCI_C_UINT4 || (t)==TCI_C_UINT8)

#define IS_TCI_APPROX(t) ((t)==TCI_C_FLOAT || (t)==TCI_C_DOUBLE)
#define IS_TCI_ARI(t) (IS_TCI_NATURAL(t) || IS_TCI_APPROX(t))
#define IS_TCI_CHAR(t) ((t)==TCI_C_SCHAR || (t)==TCI_C_WCHAR)
#define IS_TCI_FILE(t) ((t)==TCI_C_SFILE || (t)==TCI_C_WFILE)
#define IS_TCI_BINARY(t) (IS_TCI_FILE(t) || (t)==TCI_C_BYTE)

#define TCI_MILLISECOND (0x01)
#define TCI_SECOND (0x02)
#define TCI_MINUTE (0x03)
#define TCI_HOUR (0x04)
#define TCI_DAY (0x05)
#define TCI_MONTH (0x06)
#define TCI_YEAR (0x07)

#define TCI_MAKE_HL(h,l) (((h) << 4) | (l))
#define TCI_GET_HL_H(hl) (((hl) & 0x00f0) >> 4)
#define TCI_GET_HL_L(hl) ((hl) & 0x000f)

#define TCI_C_INT1 (TCI_TYPE | 0x01) /* signed char */
#define TCI_C_INT2 (TCI_TYPE | 0x02) /* signed short */
#define TCI_C_INT4 (TCI_TYPE | 0x03) /* signed int */
#define TCI_C_FLOAT (TCI_TYPE | 0x05) /* float */
#define TCI_C_DOUBLE (TCI_TYPE | 0x06) /* double */

#define TCI_C_CHAR (TCI_TYPE | TCI_TYPE_SPECIAL | 0x0a) /* char * */
#define TCI_C_INT8 (TCI_TYPE | TCI_TYPE_SPECIAL | 0x0b) /* TCIBigint */
#define TCI_C_BYTE (TCI_TYPE | TCI_TYPE_SPECIAL | 0x0c) /* unsigned char * */
#define TCI_C_FILE (TCI_TYPE | TCI_TYPE_SPECIAL | 0x0d) /* char * */

#define TCI_C_TBNATIVE (TCI_TYPE | TCI_TYPE_SPECIAL | 0x04) /* Transbase native type */

#define TCI_C_TYPE_DATE (TCI_TYPE | TCI_TYPE_SPECIAL | TCI_TYPE_DATE)

#define TCI_C_DATE_YEAR (TCI_C_TYPE_DATE | TCI_MAKE_HL(TCI_YEAR, TCI_YEAR)) /* TCIDate */
#define TCI_C_DATE_YEAR_TO_MONTH (TCI_C_TYPE_DATE | TCI_MAKE_HL(TCI_YEAR, TCI_MONTH)) /* TCIDate */
#define TCI_C_DATE_YEAR_TO_DAY (TCI_C_TYPE_DATE | TCI_MAKE_HL(TCI_YEAR, TCI_DAY)) /* TCIDate */
#define TCI_C_DATE_MONTH (TCI_C_TYPE_DATE | TCI_MAKE_HL(TCI_MONTH, TCI_MONTH)) /* TCIDate */
#define TCI_C_DATE_MONTH_TO_DAY (TCI_C_TYPE_DATE | TCI_MAKE_HL(TCI_MONTH, TCI_DAY)) /* TCIDate */
#define TCI_C_DATE_DAY (TCI_C_TYPE_DATE | TCI_MAKE_HL(TCI_DAY, TCI_DAY)) /* TCIDate */
#define TCI_C_DATE (TCI_C_DATE_YEAR_TO_DAY) /* TCIDate */

#define TCI_C_TIME_HOUR (TCI_C_TYPE_DATE | TCI_MAKE_HL(TCI_HOUR, TCI_HOUR)) /* TCITime */
#define TCI_C_TIME_HOUR_TO_MINUTE (TCI_C_TYPE_DATE | TCI_MAKE_HL(TCI_HOUR, TCI_MINUTE)) /* TCITime */
#define TCI_C_TIME_HOUR_TO_SECOND (TCI_C_TYPE_DATE | TCI_MAKE_HL(TCI_HOUR, TCI_SECOND)) /* TCITime */
#define TCI_C_TIME_MINUTE (TCI_C_TYPE_DATE | TCI_MAKE_HL(TCI_MINUTE, TCI_MINUTE)) /* TCITime */
#define TCI_C_TIME_MINUTE_TO_SECOND (TCI_C_TYPE_DATE | TCI_MAKE_HL(TCI_MINUTE, TCI_SECOND)) /* TCITime */
#define TCI_C_TIME_SECOND (TCI_C_TYPE_DATE | TCI_MAKE_HL(TCI_SECOND, TCI_SECOND)) /* TCITime */
#define TCI_C_TIME (TCI_C_TIME_HOUR_TO_SECOND) /* TCITime */

#define TCI_C_TIMESTAMP (TCI_C_TYPE_DATE | TCI_MAKE_HL(TCI_YEAR, TCI_MILLISECOND)) /* TCITimestamp */

#define TCI_C_TYPE_INTERVAL (TCI_TYPE | TCI_TYPE_SPECIAL | TCI_TYPE_INTERVAL) /* TCIInterval */

#define TCI_C_INTERVAL_YEAR (TCI_C_TYPE_INTERVAL | TCI_MAKE_HL(TCI_YEAR, TCI_YEAR)) /* TCIInterval */
#define TCI_C_INTERVAL_YEAR_TO_MONTH (TCI_C_TYPE_INTERVAL | TCI_MAKE_HL(TCI_YEAR, TCI_MONTH)) /* TCIInterval */
#define TCI_C_INTERVAL_MONTH (TCI_C_TYPE_INTERVAL | TCI_MAKE_HL(TCI_MONTH, TCI_MONTH)) /* TCIInterval */

#define TCI_C_INTERVAL_DAY (TCI_C_TYPE_INTERVAL | TCI_MAKE_HL(TCI_DAY, TCI_DAY)) /* TCIInterval */
#define TCI_C_INTERVAL_DAY_TO_HOUR (TCI_C_TYPE_INTERVAL | TCI_MAKE_HL(TCI_DAY, TCI_HOUR)) /* TCIInterval */
#define TCI_C_INTERVAL_DAY_TO_MINUTE (TCI_C_TYPE_INTERVAL | TCI_MAKE_HL(TCI_DAY, TCI_MINUTE)) /* TCIInterval */
#define TCI_C_INTERVAL_DAY_TO_SECOND (TCI_C_TYPE_INTERVAL | TCI_MAKE_HL(TCI_DAY, TCI_SECOND)) /* TCIInterval */
#define TCI_C_INTERVAL_DAY_TO_MILLISECOND (TCI_C_TYPE_INTERVAL | TCI_MAKE_HL(TCI_DAY, TCI_MILLISECOND)) /* TCIInterval */
#define TCI_C_INTERVAL_HOUR (TCI_C_TYPE_INTERVAL | TCI_MAKE_HL(TCI_HOUR, TCI_HOUR)) /* TCIInterval */
#define TCI_C_INTERVAL_HOUR_TO_MINUTE (TCI_C_TYPE_INTERVAL | TCI_MAKE_HL(TCI_HOUR, TCI_MINUTE)) /* TCIInterval */
#define TCI_C_INTERVAL_HOUR_TO_SECOND (TCI_C_TYPE_INTERVAL | TCI_MAKE_HL(TCI_HOUR, TCI_SECOND)) /* TCIInterval */
#define TCI_C_INTERVAL_HOUR_TO_MILLISECOND (TCI_C_TYPE_INTERVAL | TCI_MAKE_HL(TCI_HOUR, TCI_MILLISECOND)) /* TCIInterval */
#define TCI_C_INTERVAL_MINUTE (TCI_C_TYPE_INTERVAL | TCI_MAKE_HL(TCI_MINUTE, TCI_MINUTE)) /* TCIInterval */
#define TCI_C_INTERVAL_MINUTE_TO_SECOND (TCI_C_TYPE_INTERVAL | TCI_MAKE_HL(TCI_MINUTE, TCI_SECOND)) /* TCIInterval */
#define TCI_C_INTERVAL_MINUTE_TO_MILLISECOND (TCI_C_TYPE_INTERVAL | TCI_MAKE_HL(TCI_MINUTE, TCI_MILLISECOND)) /* TCIInterval */
#define TCI_C_INTERVAL_SECOND (TCI_C_TYPE_INTERVAL | TCI_MAKE_HL(TCI_SECOND, TCI_SECOND)) /* TCIInterval */
#define TCI_C_INTERVAL_SECOND_TO_MILLISECOND (TCI_C_TYPE_INTERVAL | TCI_MAKE_HL(TCI_SECOND, TCI_MILLISECOND)) /* TCIInterval */
#define TCI_C_INTERVAL_MILLISECOND (TCI_C_TYPE_INTERVAL | TCI_MAKE_HL(TCI_MILLISECOND, TCI_MILLISECOND)) /* TCIInterval */

#define TCI_C_SINT1 TCI_C_INT1
#define TCI_C_SINT2 TCI_C_INT2
#define TCI_C_SINT4 TCI_C_INT4
#define TCI_C_SINT8 TCI_C_INT8

#define TCI_C_UINT1 (TCI_C_INT1 | TCI_TYPE_UNSIGNED) /* unsigned char */
#define TCI_C_UINT2 (TCI_C_INT2 | TCI_TYPE_UNSIGNED) /* unsigned short */
#define TCI_C_UINT4 (TCI_C_INT4 | TCI_TYPE_UNSIGNED) /* unsigned int */
#define TCI_C_UINT8 (TCI_C_INT8 | TCI_TYPE_UNSIGNED) /* TCIUBigint */

#define TCI_C_SCHAR TCI_C_CHAR
#define TCI_C_WCHAR (TCI_C_CHAR | TCI_TYPE_WIDE) /* wchar_t * */

#define TCI_C_SFILE TCI_C_FILE
#define TCI_C_WFILE (TCI_C_FILE | TCI_TYPE_WIDE) /* wchar_t * */

#define TCI_C_TBNUMERIC TCI_C_TBNATIVE /* Numeric */
#define TCI_C_TBBLOB TCI_C_TBNATIVE /* Blob */
#define TCI_C_TBBINCHAR TCI_C_TBNATIVE /* Binchar */
#define TCI_C_TBBITSLONG TCI_C_TBNATIVE /* Bits */
#define TCI_C_TBBITSHORT TCI_C_TBNATIVE /* Bits2 */
#define TCI_C_TBDATETIME TCI_C_TBNATIVE /* Datetime; no lower byte: reserved for high/low field */
#define TCI_C_TBTIMESPAN TCI_C_TBNATIVE /* Timespan; no lower byte: reserved for high/low field */

/* SQL data types */

#define TCI_SQL_TYPE (TCI_TYPE | TCI_TYPE_SQL)

#define TCI_SQL_UNDEFTYPE (TCI_SQL_TYPE | 0x00) /* undefined type (mapping etc.) */

#define TCI_SQL_BOOL (TCI_SQL_TYPE | 0x01) /* true / false */
#define TCI_SQL_TINYINT (TCI_SQL_TYPE | 0x02) /* -128 .. 127 */
#define TCI_SQL_SMALLINT (TCI_SQL_TYPE | 0x03) /* -2**15 .. 2**15-1 */
#define TCI_SQL_INTEGER (TCI_SQL_TYPE | 0x04) /* -2**31 .. 2**31-1 */
#define TCI_SQL_NUMERIC (TCI_SQL_TYPE | 0x05) /* no prec, prec, prec/scale */
#define TCI_SQL_FLOAT (TCI_SQL_TYPE | 0x06)
#define TCI_SQL_DOUBLE (TCI_SQL_TYPE | 0x07)
#define TCI_SQL_CHAR (TCI_SQL_TYPE | 0x08) /* prec, *, with blank padding */
#define TCI_SQL_VARCHAR (TCI_SQL_TYPE | 0x09) /* prec, *, without blank padding */
#define TCI_SQL_BINARY (TCI_SQL_TYPE | 0x0a) /* prec, * */
#define TCI_SQL_BIT (TCI_SQL_TYPE | 0x0b) /* prec, * */
#define TCI_SQL_BLOB (TCI_SQL_TYPE | 0x0c)
#define TCI_SQL_FILEREF (TCI_SQL_TYPE | 0x0d)
#define TCI_SQL_BITSHORT (TCI_SQL_TYPE | 0x0e) /* prec, * */

#define TCI_SQL_TYPE_DATE (TCI_SQL_TYPE | TCI_TYPE_DATE)

#define TCI_SQL_DATE_YEAR (TCI_SQL_TYPE_DATE | TCI_MAKE_HL(TCI_YEAR, TCI_YEAR))
#define TCI_SQL_DATE_YEAR_TO_MONTH (TCI_SQL_TYPE_DATE | TCI_MAKE_HL(TCI_YEAR, TCI_MONTH))
#define TCI_SQL_DATE_YEAR_TO_DAY (TCI_SQL_TYPE_DATE | TCI_MAKE_HL(TCI_YEAR, TCI_DAY))
#define TCI_SQL_DATE_YEAR_TO_HOUR (TCI_SQL_TYPE_DATE | TCI_MAKE_HL(TCI_YEAR, TCI_HOUR))
#define TCI_SQL_DATE_YEAR_TO_MINUTE (TCI_SQL_TYPE_DATE | TCI_MAKE_HL(TCI_YEAR, TCI_MINUTE))
#define TCI_SQL_DATE_YEAR_TO_SECOND (TCI_SQL_TYPE_DATE | TCI_MAKE_HL(TCI_YEAR, TCI_SECOND))
#define TCI_SQL_DATE_YEAR_TO_MILLISECOND (TCI_SQL_TYPE_DATE | TCI_MAKE_HL(TCI_YEAR, TCI_MILLISECOND))
#define TCI_SQL_DATE_MONTH (TCI_SQL_TYPE_DATE | TCI_MAKE_HL(TCI_MONTH, TCI_MONTH))
#define TCI_SQL_DATE_MONTH_TO_DAY (TCI_SQL_TYPE_DATE | TCI_MAKE_HL(TCI_MONTH, TCI_DAY))
#define TCI_SQL_DATE_MONTH_TO_HOUR (TCI_SQL_TYPE_DATE | TCI_MAKE_HL(TCI_MONTH, TCI_HOUR))
#define TCI_SQL_DATE_MONTH_TO_MINUTE (TCI_SQL_TYPE_DATE | TCI_MAKE_HL(TCI_MONTH, TCI_MINUTE))
#define TCI_SQL_DATE_MONTH_TO_SECOND (TCI_SQL_TYPE_DATE | TCI_MAKE_HL(TCI_MONTH, TCI_SECOND))
#define TCI_SQL_DATE_MONTH_TO_MILLISECOND (TCI_SQL_TYPE_DATE | TCI_MAKE_HL(TCI_MONTH, TCI_MILLISECOND))
#define TCI_SQL_DATE_DAY (TCI_SQL_TYPE_DATE | TCI_MAKE_HL(TCI_DAY, TCI_DAY))
#define TCI_SQL_DATE_DAY_TO_HOUR (TCI_SQL_TYPE_DATE | TCI_MAKE_HL(TCI_DAY, TCI_HOUR))
#define TCI_SQL_DATE_DAY_TO_MINUTE (TCI_SQL_TYPE_DATE | TCI_MAKE_HL(TCI_DAY, TCI_MINUTE))
#define TCI_SQL_DATE_DAY_TO_SECOND (TCI_SQL_TYPE_DATE | TCI_MAKE_HL(TCI_DAY, TCI_SECOND))
#define TCI_SQL_DATE_DAY_TO_MILLISECOND (TCI_SQL_TYPE_DATE | TCI_MAKE_HL(TCI_DAY, TCI_MILLISECOND))
#define TCI_SQL_DATE_HOUR (TCI_SQL_TYPE_DATE | TCI_MAKE_HL(TCI_HOUR, TCI_HOUR))
#define TCI_SQL_DATE_HOUR_TO_MINUTE (TCI_SQL_TYPE_DATE | TCI_MAKE_HL(TCI_HOUR, TCI_MINUTE))
#define TCI_SQL_DATE_HOUR_TO_SECOND (TCI_SQL_TYPE_DATE | TCI_MAKE_HL(TCI_HOUR, TCI_SECOND))
#define TCI_SQL_DATE_HOUR_TO_MILLISECOND (TCI_SQL_TYPE_DATE | TCI_MAKE_HL(TCI_HOUR, TCI_MILLISECOND))
#define TCI_SQL_DATE_MINUTE (TCI_SQL_TYPE_DATE | TCI_MAKE_HL(TCI_MINUTE, TCI_MINUTE))
#define TCI_SQL_DATE_MINUTE_TO_SECOND (TCI_SQL_TYPE_DATE | TCI_MAKE_HL(TCI_MINUTE, TCI_SECOND))
#define TCI_SQL_DATE_MINUTE_TO_MILLISECOND (TCI_SQL_TYPE_DATE | TCI_MAKE_HL(TCI_MINUTE, TCI_MILLISECOND))
#define TCI_SQL_DATE_SECOND (TCI_SQL_TYPE_DATE | TCI_MAKE_HL(TCI_SECOND, TCI_SECOND))
#define TCI_SQL_DATE_SECOND_TO_MILLISECOND (TCI_SQL_TYPE_DATE | TCI_MAKE_HL(TCI_SECOND, TCI_MILLISECOND))
#define TCI_SQL_DATE_MILLISECOND (TCI_SQL_TYPE_DATE | TCI_MAKE_HL(TCI_MILLISECOND, TCI_MILLISECOND))

#define TCI_SQL_DATE (TCI_SQL_DATE_YEAR_TO_DAY)
#define TCI_SQL_TIME (TCI_SQL_DATE_HOUR_TO_SECOND)
#define TCI_SQL_TIMESTAMP (TCI_SQL_DATE_YEAR_TO_MILLISECOND)

#define TCI_SQL_TYPE_INTERVAL (TCI_SQL_TYPE | TCI_TYPE_INTERVAL)

#define TCI_SQL_INTERVAL_YEAR (TCI_SQL_TYPE_INTERVAL | TCI_MAKE_HL(TCI_YEAR, TCI_YEAR))
#define TCI_SQL_INTERVAL_YEAR_TO_MONTH (TCI_SQL_TYPE_INTERVAL | TCI_MAKE_HL(TCI_YEAR, TCI_MONTH))
#define TCI_SQL_INTERVAL_MONTH (TCI_SQL_TYPE_INTERVAL | TCI_MAKE_HL(TCI_MONTH, TCI_MONTH))
#define TCI_SQL_INTERVAL_DAY (TCI_SQL_TYPE_INTERVAL | TCI_MAKE_HL(TCI_DAY, TCI_DAY))
#define TCI_SQL_INTERVAL_DAY_TO_HOUR (TCI_SQL_TYPE_INTERVAL | TCI_MAKE_HL(TCI_DAY, TCI_HOUR))
#define TCI_SQL_INTERVAL_DAY_TO_MINUTE (TCI_SQL_TYPE_INTERVAL | TCI_MAKE_HL(TCI_DAY, TCI_MINUTE))
#define TCI_SQL_INTERVAL_DAY_TO_SECOND (TCI_SQL_TYPE_INTERVAL | TCI_MAKE_HL(TCI_DAY, TCI_SECOND))
#define TCI_SQL_INTERVAL_DAY_TO_MILLISECOND (TCI_SQL_TYPE_INTERVAL | TCI_MAKE_HL(TCI_DAY, TCI_MILLISECOND))
#define TCI_SQL_INTERVAL_HOUR (TCI_SQL_TYPE_INTERVAL | TCI_MAKE_HL(TCI_HOUR, TCI_HOUR))
#define TCI_SQL_INTERVAL_HOUR_TO_MINUTE (TCI_SQL_TYPE_INTERVAL | TCI_MAKE_HL(TCI_HOUR, TCI_MINUTE))
#define TCI_SQL_INTERVAL_HOUR_TO_SECOND (TCI_SQL_TYPE_INTERVAL | TCI_MAKE_HL(TCI_HOUR, TCI_SECOND))
#define TCI_SQL_INTERVAL_HOUR_TO_MILLISECOND (TCI_SQL_TYPE_INTERVAL | TCI_MAKE_HL(TCI_HOUR, TCI_MILLISECOND))
#define TCI_SQL_INTERVAL_MINUTE (TCI_SQL_TYPE_INTERVAL | TCI_MAKE_HL(TCI_MINUTE, TCI_MINUTE))
#define TCI_SQL_INTERVAL_MINUTE_TO_SECOND (TCI_SQL_TYPE_INTERVAL | TCI_MAKE_HL(TCI_MINUTE, TCI_SECOND))
#define TCI_SQL_INTERVAL_MINUTE_TO_MILLISECOND (TCI_SQL_TYPE_INTERVAL | TCI_MAKE_HL(TCI_MINUTE, TCI_MILLISECOND))
#define TCI_SQL_INTERVAL_SECOND (TCI_SQL_TYPE_INTERVAL | TCI_MAKE_HL(TCI_SECOND, TCI_SECOND))
#define TCI_SQL_INTERVAL_SECOND_TO_MILLISECOND (TCI_SQL_TYPE_INTERVAL | TCI_MAKE_HL(TCI_SECOND, TCI_MILLISECOND))
#define TCI_SQL_INTERVAL_MILLISECOND (TCI_SQL_TYPE_INTERVAL | TCI_MAKE_HL(TCI_MILLISECOND, TCI_MILLISECOND))

/* attribute ids */
#define TCI_ATTR_BULKSIZE 1
#define TCI_ATTR_CODEPAGE 2
#define TCI_ATTR_COLUMN_ACTSIZE 3
#define TCI_ATTR_COLUMN_BOUND 4
#define TCI_ATTR_COLUMN_BUFFER 5
#define TCI_ATTR_COLUMN_BUFFERTYPE 6
#define TCI_ATTR_COLUMN_COUNT 7
#define TCI_ATTR_COLUMN_INDICATOR 8
#define TCI_ATTR_COLUMN_MAXSIZE 9
#define TCI_ATTR_COLUMN_NAME 10
#define TCI_ATTR_COLUMN_NAME_FROM_DB 11
#define TCI_ATTR_COLUMN_PRECISION 12
#define TCI_ATTR_COLUMN_SCALE 13
#define TCI_ATTR_COLUMN_TYPE 14
#define TCI_ATTR_CONNECTION 15
#define TCI_ATTR_CONNECTION_COUNT 16
#define TCI_ATTR_CONNECTION_TIMEOUT 17
#define TCI_ATTR_CONSISTENCY_LEVEL 18
#define TCI_ATTR_DATA_DIRECTORY 19
#define TCI_ATTR_DATABASE_NAME 20
#define TCI_ATTR_ENVIRONMENT 21
#define TCI_ATTR_ERROR 22
#define TCI_ATTR_ERROR_COUNT 23
#define TCI_ATTR_SCROLLABLE 24
#define TCI_ATTR_NAME 25
#define TCI_ATTR_PARAMETER_BOUND 26
#define TCI_ATTR_PARAMETER_BUFFER 27
#define TCI_ATTR_PARAMETER_BUFFERTYPE 28
#define TCI_ATTR_PARAMETER_COUNT 29
#define TCI_ATTR_PARAMETER_INDICATOR 30
#define TCI_ATTR_PARAMETER_MAXSIZE 31
#define TCI_ATTR_PARAMETER_PRECISION 32
#define TCI_ATTR_PARAMETER_SCALE 33
#define TCI_ATTR_PARAMETER_TYPE 34
#define TCI_ATTR_POSITION 35
#define TCI_ATTR_QUERY_TYPE 36
#define TCI_ATTR_QUERY_UPDATABLE 37
#define TCI_ATTR_RESULTSET 38
#define TCI_ATTR_RESULTSET_COUNT 39
#define TCI_ATTR_ROWCOUNT 40
#define TCI_ATTR_SINGLEBYTE_CHARSET 41
#define TCI_ATTR_SORTORDER 42
#define TCI_ATTR_SQL 43
#define TCI_ATTR_STATE 44
#define TCI_ATTR_STATEMENT 45
#define TCI_ATTR_STATEMENT_COUNT 46
#define TCI_ATTR_STATEMENT_TIMEOUT 47
#define TCI_ATTR_TIMEOUT 48
#define TCI_ATTR_TRANSACTION 49
#define TCI_ATTR_TRANSACTION_COUNT 50
#define TCI_ATTR_TRANSACTION_TIMEOUT 51
#define TCI_ATTR_USER_NAME 52
#define TCI_ATTR_WIDECHAR_SUBSTITUTE 53
#define TCI_ATTR_RECORDS_TRIED 54
#define TCI_ATTR_RECORDS_TOUCHED 55
#define TCI_ATTR_INIFILE 56
#define TCI_ATTR_INSENSITIVE 57
#define TCI_ATTR_EOD 58
#define TCI_ATTR_TRACEFILE 59
#define TCI_ATTR_TRACE 60
#define TCI_ATTR_REFERENCED_RESULTSET 61
#define TCI_ATTR_ABORT_CALLBACK 62
#define TCI_ATTR_CLIENTCODEPAGE 63
#define TCI_ATTR_NUMBER_OPEN_RESULTSETS 64
#define TCI_ATTR_CHAR_SUBSTITUTE 65
#define TCI_ATTR_PLANFILE 66
#define TCI_ATTR_PLANFILE_MODE 67
#define TCI_ATTR_VERSION 68
#define TCI_ATTR_NUMBER_PARAMETER_BINDINGS 69
#define TCI_ATTR_NUMBER_COLUMN_BINDINGS 70
#define TCI_ATTR_PARAMETER_NAME 71
#define TCI_ATTR_PARAMETER_MODE 72
#define TCI_ATTR_PARAMETER_TYPENAME 73
#define TCI_ATTR_COLUMN_TYPENAME 74
#define TCI_ATTR_PARAMETER_DISPSIZE 75
#define TCI_ATTR_COLUMN_DISPSIZE 76

/* states */
#define TCI_SUCCESS 0
#define TCI_ERROR -1
#define TCI_NO_DATA_FOUND 100

#define TCI_INVALID_HANDLE 17001


#define TCI_INDEX_OUT_OF_RANGE 17002


#define TCI_TRANSACTIONS_ROLLEDBACK 17027


/* planfile modes */
#define TCI_APPEND 0
#define TCI_OVERWRITE 1

/* additional states */
#define NOT_PREPARED 0
#define PREPARED 1

/* TA consistency states */
#define TCI_CONS_1 1
#define TCI_CONS_2 2
#define TCI_CONS_3 3

/* query eod states */
#define TCI_NO_TUPLE 0
#define TCI_ONE_TUPLE 1
#define TCI_MORE_TUPLES 2

/* scroll modes */
#define TCI_FETCH_NEXT 1 /* Fetch next tuple (nTupleOffset ignored) */
#define TCI_FETCH_PRIOR 2 /* Fetch previous tuple (nTupleOffset ignored) */
#define TCI_FETCH_FIRST 3 /* Fetch first tuple (nTupleOffset ignored) */
#define TCI_FETCH_LAST 4 /* Fetch last tuple (nTupleOffset ignored) */
#define TCI_FETCH_ABSOLUTE 5 /* Fetch tuple nTupleOffset from start */
#define TCI_FETCH_RELATIVE 6 /* Fetch tuple nTupleOffset from here */

/* codepages */
#define TCI_CPG_INVALID 0
#define TCI_CPG_UNICODE 1
#define TCI_CPG_PROPRIET 2
#define TCI_CPG_ASCII 3
#define TCI_CPG_LOCALE 4
#define TCI_CPG_UTF8 5
#define TCI_CPG_EUC 6
#define TCI_CPG_JIS 7

typedef Uint2 Columnnumber;
typedef Uint2 Attribute;
typedef Uint2 Datatype;
typedef Uint2 Querytype;
typedef Uint1 Consistency;
typedef Uint1 Parametermode;
typedef int TCIState;
typedef struct _TCICodemapEntry {
        char c;
        Uint4 wc;
} TCICodemapEntry;

/* C data types */

typedef struct {
        unsigned int dwLowWord;
        int dwHighWord;
} TCIBigint;

typedef struct {
        unsigned int dwLowWord;
        unsigned int dwHighWord;
} TCIUBigint;

typedef struct {
        short year;
        unsigned short month;
        unsigned short day;
} TCIDate;

typedef struct {
        unsigned short hour;
        unsigned short minute;
        unsigned short second;
} TCITime;

typedef struct {
        short year;
        unsigned short month;
        unsigned short day;
        unsigned short hour;
        unsigned short minute;
        unsigned short second;
        unsigned int fraction;
} TCITimestamp;

typedef enum {
        TCI_IS_YEAR = 1,
        TCI_IS_MONTH = 2,
        TCI_IS_DAY = 3,
        TCI_IS_HOUR = 4,
        TCI_IS_MINUTE = 5,
        TCI_IS_SECOND_TO_MILLISECOND = 6,
        TCI_IS_YEAR_TO_MONTH = 7,
        TCI_IS_DAY_TO_HOUR = 8,
        TCI_IS_DAY_TO_MINUTE = 9,
        TCI_IS_DAY_TO_MILLISECOND = 10,
        TCI_IS_HOUR_TO_MINUTE = 11,
        TCI_IS_HOUR_TO_MILLISECOND = 12,
        TCI_IS_MINUTE_TO_MILLISECOND = 13,
        TCI_IS_DAY_TO_SECOND = 14,
        TCI_IS_HOUR_TO_SECOND = 15,
        TCI_IS_MINUTE_TO_SECOND = 16,
        TCI_IS_SECOND = 17,
        TCI_IS_MILLISECOND = 18
} TCIIntervalType;

typedef struct {
        unsigned int year;
        unsigned int month;
} TCIYearMonth;

typedef struct {
        unsigned int day;
        unsigned int hour;
        unsigned int minute;
        unsigned int second;
        unsigned int fraction;
} TCIDaySecond;

typedef struct {
        TCIIntervalType interval_type;
        short interval_sign;
        union {
                TCIYearMonth year_month;
                TCIDaySecond day_second;
        } intval;
} TCIInterval;

/* version struct */
typedef struct _TCIVersion {
        long major_version;
        long minor_version;
        long release;
        long patch;
        long build;
        TCIDate date;
} TCIVersion;

typedef struct TCIEnvironment TCIEnvironment;
typedef struct TCIError TCIError;
typedef struct TCIConnection TCIConnection;
typedef struct TCITransaction TCITransaction;
typedef struct TCIStatement TCIStatement;
typedef struct TCIResultSet TCIResultSet;



#pragma pack()


#if USE_PROTOTYPES == 1
/* singlechar interface */
TCIState TCI_API TCIAllocEnvironmentA(TCIEnvironment** ppEnv);
TCIState TCI_API TCIAllocErrorA(TCIEnvironment* pEnv, TCIError** ppErr);
TCIState TCI_API TCIAllocConnectionA(TCIEnvironment* pEnv, TCIError* pErr, TCIConnection** ppConn);
TCIState TCI_API TCIAllocTransactionA(TCIEnvironment* pEnv, TCIError* pErr, TCITransaction** ppTa);
TCIState TCI_API TCIAllocStatementA(TCIConnection* pConn, TCIError* pErr, TCIStatement** ppStmt);
TCIState TCI_API TCIAllocResultSetA(TCIStatement* pStmt, TCIError* pErr, TCIResultSet** ppResSet);

TCIState TCI_API TCIFreeEnvironmentA(TCIEnvironment* pEnv);
TCIState TCI_API TCIFreeErrorA(TCIError* pErr);
TCIState TCI_API TCIFreeConnectionA(TCIConnection* pConn);
TCIState TCI_API TCIFreeTransactionA(TCITransaction* pTa);
TCIState TCI_API TCIFreeStatementA(TCIStatement* pStmt);
TCIState TCI_API TCIFreeResultSetA(TCIResultSet* pResSet);

TCIState TCI_API TCIConnectA(TCIConnection* pConn, char* pszDatabaseName);
TCIState TCI_API TCIDisconnectA(TCIConnection* pConn);
TCIState TCI_API TCILoginA(TCIConnection* pConn, char* pszUserName, char* pszPassword);
TCIState TCI_API TCIGetPlanA(TCIConnection* pConn, char* pszFileName, char* pszMode);
TCIState TCI_API TCIGetBlobPartA(TCIConnection* pConn, Blob* pBlob, Blobdesc* pBlobdesc, Uint4 nOffset, Uint4 nSize);

TCIState TCI_API TCIBeginTransactionA(TCITransaction* pTa, TCIConnection* pConn);
TCIState TCI_API TCICommitTransactionA(TCITransaction* pTa);
TCIState TCI_API TCIRollbackTransactionA(TCITransaction* pTa);
TCIState TCI_API TCIBreakA(TCITransaction* pTa);

TCIState TCI_API TCIPrepareA(TCIStatement* pStmt, char* pszStatement);
TCIState TCI_API TCIBindParameterA(TCIResultSet* pResSet, Columnnumber nParamNr, void* pBuffer, Int4 nMaxBufferSize, Int4* pnBufferSize, Datatype nType, Int2* pnIndicator);
TCIState TCI_API TCIUnbindParametersA(TCIResultSet* pResSet);
TCIState TCI_API TCIExecuteA(TCIResultSet* pResSet, Uint4 nIterations, Uint4 nTuplesToFetch);
TCIState TCI_API TCIExecuteDirectA(TCIResultSet* pResSet, char* pszStatement, Uint4 nIterations, Uint4 nTuplesToFetch);
TCIState TCI_API TCIBindColumnA(TCIResultSet* pResSet, Columnnumber nColNr, void* pBuffer, Int4 nMaxBufferSize, Int4* pActualSize, Datatype nType, Int2* pIndicator);
TCIState TCI_API TCIBindColumnByNameA(TCIResultSet* pResSet, char* pszColumnName, void* pBuffer, Int4 nMaxBufferSize, Int4* pActualSize, Datatype nType, Int2* pIndicator);
TCIState TCI_API TCIUnbindColumnsA(TCIResultSet* pResSet);
TCIState TCI_API TCIResetColumnA(TCIResultSet* pResSet, Columnnumber nColNr);
TCIState TCI_API TCIFetchA(TCIResultSet* pResSet, Uint4 nTuplesToFetch, Uint2 nDirection, Int4 nTupleOffset);
TCIState TCI_API TCICloseA(TCIResultSet* pResSet);

TCIState TCI_API TCISetDataA(TCIResultSet* pResSet, Columnnumber nParamNr, void* pBuffer, Int4 nBufferSize, Datatype nType, Int2 nIndicator);
TCIState TCI_API TCIGetDataA(TCIResultSet* pResSet, Columnnumber nColNr, void* pBuffer, Int4 nMaxBufferSize, Int4* pActualSize, Datatype nType, Int2* pIndicator);
TCIState TCI_API TCIGetDataByNameA(TCIResultSet* pResSet, char* pszColumnName, void* pBuffer, Int4 nMaxBufferSize, Int4* pActualSize, Datatype nType, Int2* pIndicator);

TCIState TCI_API TCIGetErrorA(TCIError* pErr, Uint4 nRecord, Uint2 nthError, char* pErrorMessage, Uint4 nMessageSize, Error* pErrorCode, char* pSqlstate);
TCIState TCI_API TCIGetEnvironmentErrorA(TCIEnvironment* pEnv, Uint2 nthError, char* pErrorMessage, Uint4 nMessageSize, Error* pErrorCode, char* pSqlstate);

TCIState TCI_API TCIGetEnvironmentAttributeA(TCIEnvironment* pEnv, Attribute nAttributeCode, Uint4 nNumber, void* pBuffer, Uint4 nMaxBufferSize, Uint4* pActualSize);
TCIState TCI_API TCIGetErrorAttributeA(TCIError* pErr, Attribute nAttributeCode, Uint4 nNumber, void* pBuffer, Uint4 nMaxBufferSize, Uint4* pActualSize);
TCIState TCI_API TCIGetConnectionAttributeA(TCIConnection* pConn, Attribute nAttributeCode, Uint4 nNumber, void* pBuffer, Uint4 nMaxBufferSize, Uint4* pActualSize);
TCIState TCI_API TCIGetTransactionAttributeA(TCITransaction* pTa, Attribute nAttributeCode, Uint4 nNumber, void* pBuffer, Uint4 nMaxBufferSize, Uint4* pActualSize);
TCIState TCI_API TCIGetStatementAttributeA(TCIStatement* pStmt, Attribute nAttributeCode, Uint4 nNumber, void* pBuffer, Uint4 nMaxBufferSize, Uint4* pActualSize);
TCIState TCI_API TCIGetResultSetAttributeA(TCIResultSet* pResSet, Attribute nAttributeCode, Uint4 nNumber, void* pBuffer, Uint4 nMaxBufferSize, Uint4* pActualSize);

TCIState TCI_API TCISetEnvironmentAttributeA(TCIEnvironment* pEnv, Attribute nAttributeCode, Uint4 nNumber, void* pBuffer);
TCIState TCI_API TCISetErrorAttributeA(TCIError* pErr, Attribute nAttributeCode, Uint4 nNumber, void* pBuffer);
TCIState TCI_API TCISetConnectionAttributeA(TCIConnection* pConn, Attribute nAttributeCode, Uint4 nNumber, void* pBuffer);
TCIState TCI_API TCISetTransactionAttributeA(TCITransaction* pTa, Attribute nAttributeCode, Uint4 nNumber, void* pBuffer);
TCIState TCI_API TCISetStatementAttributeA(TCIStatement* pStmt, Attribute nAttributeCode, Uint4 nNumber, void* pBuffer);
TCIState TCI_API TCISetResultSetAttributeA(TCIResultSet* pResSet, Attribute nAttributeCode, Uint4 nNumber, void* pBuffer);

/* widechar interface */
TCIState TCI_API TCIAllocEnvironmentW(TCIEnvironment** ppEnv);
TCIState TCI_API TCIAllocErrorW(TCIEnvironment* pEnv, TCIError** ppErr);
TCIState TCI_API TCIAllocConnectionW(TCIEnvironment* pEnv, TCIError* pErr, TCIConnection** ppConn);
TCIState TCI_API TCIAllocTransactionW(TCIEnvironment* pEnv, TCIError* pErr, TCITransaction** ppTa);
TCIState TCI_API TCIAllocStatementW(TCIConnection* pConn, TCIError* pErr, TCIStatement** ppStmt);
TCIState TCI_API TCIAllocResultSetW(TCIStatement* pStmt, TCIError* pErr, TCIResultSet** ppResSet);

TCIState TCI_API TCIFreeEnvironmentW(TCIEnvironment* pEnv);
TCIState TCI_API TCIFreeErrorW(TCIError* pErr);
TCIState TCI_API TCIFreeConnectionW(TCIConnection* pConn);
TCIState TCI_API TCIFreeTransactionW(TCITransaction* pTa);
TCIState TCI_API TCIFreeStatementW(TCIStatement* pStmt);
TCIState TCI_API TCIFreeResultSetW(TCIResultSet* pResSet);

TCIState TCI_API TCIConnectW(TCIConnection* pConn, wchar_t* pszDatabaseName);
TCIState TCI_API TCIDisconnectW(TCIConnection* pConn);
TCIState TCI_API TCILoginW(TCIConnection* pConn, wchar_t* pszUserName, wchar_t* pszPassword);
TCIState TCI_API TCIGetPlanW(TCIConnection* pConn, wchar_t* pszFileName, wchar_t* pszMode);
TCIState TCI_API TCIGetBlobPartW(TCIConnection* pConn, Blob* pBlob, Blobdesc* pBlobdesc, Uint4 nOffset, Uint4 nSize);

TCIState TCI_API TCIBeginTransactionW(TCITransaction* pTa, TCIConnection* pConn);
TCIState TCI_API TCICommitTransactionW(TCITransaction* pTa);
TCIState TCI_API TCIRollbackTransactionW(TCITransaction* pTa);
TCIState TCI_API TCIBreakW(TCITransaction* pTa);

TCIState TCI_API TCIPrepareW(TCIStatement* pStmt, wchar_t* pszStatement);
TCIState TCI_API TCIBindParameterW(TCIResultSet* pResSet, Columnnumber nParamNr, void* pBuffer, Int4 nMaxBufferSize, Int4* pnBufferSize, Datatype nType, Int2* pnIndicator);
TCIState TCI_API TCIUnbindParametersW(TCIResultSet* pResSet);
TCIState TCI_API TCIExecuteW(TCIResultSet* pResSet, Uint4 nIterations, Uint4 nTuplesToFetch);
TCIState TCI_API TCIExecuteDirectW(TCIResultSet* pResSet, wchar_t* pszStatement, Uint4 nIterations, Uint4 nTuplesToFetch);
TCIState TCI_API TCIBindColumnW(TCIResultSet* pResSet, Columnnumber nColNr, void* pBuffer, Int4 nMaxBufferSize, Int4* pActualSize, Datatype nType, Int2* pIndicator);
TCIState TCI_API TCIBindColumnByNameW(TCIResultSet* pResSet, wchar_t* pszColumnName, void* pBuffer, Int4 nMaxBufferSize, Int4* pActualSize, Datatype nType, Int2* pIndicator);
TCIState TCI_API TCIUnbindColumnsW(TCIResultSet* pResSet);
TCIState TCI_API TCIResetColumnW(TCIResultSet* pResSet, Columnnumber nColNr);
TCIState TCI_API TCIFetchW(TCIResultSet* pResSet, Uint4 nTuplesToFetch, Uint2 nDirection, Int4 nTupleOffset);
TCIState TCI_API TCICloseW(TCIResultSet* pResSet);

TCIState TCI_API TCISetDataW(TCIResultSet* pResSet, Columnnumber nParamNr, void* pBuffer, Int4 nBufferSize, Datatype nType, Int2 nIndicator);
TCIState TCI_API TCIGetDataW(TCIResultSet* pResSet, Columnnumber nColNr, void* pBuffer, Int4 nMaxBufferSize, Int4* pActualSize, Datatype nType, Int2* pIndicator);
TCIState TCI_API TCIGetDataByNameW(TCIResultSet* pResSet, wchar_t* pszColumnName, void* pBuffer, Int4 nMaxBufferSize, Int4* pActualSize, Datatype nType, Int2* pIndicator);

TCIState TCI_API TCIGetErrorW(TCIError* pErr, Uint4 nRecord, Uint2 nthError, wchar_t* pErrorMessage, Uint4 nMessageSize, Error* pErrorCode, wchar_t* pSqlstate);
TCIState TCI_API TCIGetEnvironmentErrorW(TCIEnvironment* pEnv, Uint2 nthError, wchar_t* pErrorMessage, Uint4 nMessageSize, Error* pErrorCode, wchar_t* pSqlstate);

TCIState TCI_API TCIGetEnvironmentAttributeW(TCIEnvironment* pEnv, Attribute nAttributeCode, Uint4 nNumber, void* pBuffer, Uint4 nMaxBufferSize, Uint4* pActualSize);
TCIState TCI_API TCIGetErrorAttributeW(TCIError* pErr, Attribute nAttributeCode, Uint4 nNumber, void* pBuffer, Uint4 nMaxBufferSize, Uint4* pActualSize);
TCIState TCI_API TCIGetConnectionAttributeW(TCIConnection* pConn, Attribute nAttributeCode, Uint4 nNumber, void* pBuffer, Uint4 nMaxBufferSize, Uint4* pActualSize);
TCIState TCI_API TCIGetTransactionAttributeW(TCITransaction* pTa, Attribute nAttributeCode, Uint4 nNumber, void* pBuffer, Uint4 nMaxBufferSize, Uint4* pActualSize);
TCIState TCI_API TCIGetStatementAttributeW(TCIStatement* pStmt, Attribute nAttributeCode, Uint4 nNumber, void* pBuffer, Uint4 nMaxBufferSize, Uint4* pActualSize);
TCIState TCI_API TCIGetResultSetAttributeW(TCIResultSet* pResSet, Attribute nAttributeCode, Uint4 nNumber, void* pBuffer, Uint4 nMaxBufferSize, Uint4* pActualSize);

TCIState TCI_API TCISetEnvironmentAttributeW(TCIEnvironment* pEnv, Attribute nAttributeCode, Uint4 nNumber, void* pBuffer);
TCIState TCI_API TCISetErrorAttributeW(TCIError* pErr, Attribute nAttributeCode, Uint4 nNumber, void* pBuffer);
TCIState TCI_API TCISetConnectionAttributeW(TCIConnection* pConn, Attribute nAttributeCode, Uint4 nNumber, void* pBuffer);
TCIState TCI_API TCISetTransactionAttributeW(TCITransaction* pTa, Attribute nAttributeCode, Uint4 nNumber, void* pBuffer);
TCIState TCI_API TCISetStatementAttributeW(TCIStatement* pStmt, Attribute nAttributeCode, Uint4 nNumber, void* pBuffer);
TCIState TCI_API TCISetResultSetAttributeW(TCIResultSet* pResSet, Attribute nAttributeCode, Uint4 nNumber, void* pBuffer);

#else
/* singlechar interface */
TCIState TCI_API TCIAllocEnvironmentA();
TCIState TCI_API TCIAllocErrorA();
TCIState TCI_API TCIAllocConnectionA();
TCIState TCI_API TCIAllocTransactionA();
TCIState TCI_API TCIAllocStatementA();
TCIState TCI_API TCIAllocResultSetA();

TCIState TCI_API TCIFreeEnvironmentA();
TCIState TCI_API TCIFreeErrorA();
TCIState TCI_API TCIFreeConnectionA();
TCIState TCI_API TCIFreeTransactionA();
TCIState TCI_API TCIFreeStatementA();
TCIState TCI_API TCIFreeResultSetA();

TCIState TCI_API TCIConnectA();
TCIState TCI_API TCIDisconnectA();
TCIState TCI_API TCILoginA();
TCIState TCI_API TCIGetPlanA();
TCIState TCI_API TCIGetBlobPartA();

TCIState TCI_API TCIBeginTransactionA();
TCIState TCI_API TCICommitTransactionA();
TCIState TCI_API TCIRollbackTransactionA();
TCIState TCI_API TCIBreakA();

TCIState TCI_API TCIPrepareA();
TCIState TCI_API TCIBindParameterA();
TCIState TCI_API TCIUnbindParametersA();
TCIState TCI_API TCIExecuteA();
TCIState TCI_API TCIExecuteDirectA();
TCIState TCI_API TCIBindColumnA();
TCIState TCI_API TCIBindColumnByNameA();
TCIState TCI_API TCIUnbindColumnsA();
TCIState TCI_API TCIResetColumnA();
TCIState TCI_API TCIFetchA();
TCIState TCI_API TCICloseA();

TCIState TCI_API TCISetDataA();
TCIState TCI_API TCIGetDataA();
TCIState TCI_API TCIGetDataByNameA();

TCIState TCI_API TCIGetErrorA();
TCIState TCI_API TCIGetEnvironmentErrorA();

TCIState TCI_API TCIGetEnvironmentAttributeA();
TCIState TCI_API TCIGetErrorAttributeA();
TCIState TCI_API TCIGetConnectionAttributeA();
TCIState TCI_API TCIGetTransactionAttributeA();
TCIState TCI_API TCIGetStatementAttributeA();
TCIState TCI_API TCIGetResultSetAttributeA();

TCIState TCI_API TCISetEnvironmentAttributeA();
TCIState TCI_API TCISetErrorAttributeA();
TCIState TCI_API TCISetConnectionAttributeA();
TCIState TCI_API TCISetTransactionAttributeA();
TCIState TCI_API TCISetStatementAttributeA();
TCIState TCI_API TCISetResultSetAttributeA();

/* widechar interface */
TCIState TCI_API TCIAllocEnvironmentW();
TCIState TCI_API TCIAllocErrorW();
TCIState TCI_API TCIAllocConnectionW();
TCIState TCI_API TCIAllocTransactionW();
TCIState TCI_API TCIAllocStatementW();
TCIState TCI_API TCIAllocResultSetW();

TCIState TCI_API TCIFreeEnvironmentW();
TCIState TCI_API TCIFreeErrorW();
TCIState TCI_API TCIFreeConnectionW();
TCIState TCI_API TCIFreeTransactionW();
TCIState TCI_API TCIFreeStatementW();
TCIState TCI_API TCIFreeResultSetW();

TCIState TCI_API TCIConnectW();
TCIState TCI_API TCIDisconnectW();
TCIState TCI_API TCILoginW();
TCIState TCI_API TCIGetPlanW();
TCIState TCI_API TCIGetBlobPartW();

TCIState TCI_API TCIBeginTransactionW();
TCIState TCI_API TCICommitTransactionW();
TCIState TCI_API TCIRollbackTransactionW();
TCIState TCI_API TCIBreakW();

TCIState TCI_API TCIPrepareW();
TCIState TCI_API TCIBindParameterW();
TCIState TCI_API TCIUnbindParametersW();
TCIState TCI_API TCIExecuteW();
TCIState TCI_API TCIExecuteDirectW();
TCIState TCI_API TCIBindColumnW();
TCIState TCI_API TCIBindColumnByNameW();
TCIState TCI_API TCIUnbindColumnsW();
TCIState TCI_API TCIResetColumnW();
TCIState TCI_API TCIFetchW();
TCIState TCI_API TCICloseW();

TCIState TCI_API TCISetDataW();
TCIState TCI_API TCIGetDataW();
TCIState TCI_API TCIGetDataByNameW();

TCIState TCI_API TCIGetErrorW();
TCIState TCI_API TCIGetEnvironmentErrorW();

TCIState TCI_API TCIGetEnvironmentAttributeW();
TCIState TCI_API TCIGetErrorAttributeW();
TCIState TCI_API TCIGetConnectionAttributeW();
TCIState TCI_API TCIGetTransactionAttributeW();
TCIState TCI_API TCIGetStatementAttributeW();
TCIState TCI_API TCIGetResultSetAttributeW();

TCIState TCI_API TCISetEnvironmentAttributeW();
TCIState TCI_API TCISetErrorAttributeW();
TCIState TCI_API TCISetConnectionAttributeW();
TCIState TCI_API TCISetTransactionAttributeW();
TCIState TCI_API TCISetStatementAttributeW();
TCIState TCI_API TCISetResultSetAttributeW();

#endif
#ifdef _UNICODE
#include "tciw.h"
#else
#include "tcia.h"
#endif
#ifdef __cplusplus
}
#endif
#endif

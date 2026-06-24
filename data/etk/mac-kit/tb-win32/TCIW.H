/******************************************************** 

                      T r a n s B a s e / C D
  @(#) tciw.h:   V6.1.2.19 (Build 404)
		Project: 4.119.1.19
		2004/08/05 11:46:57

  Copyright (c) 1995 - 
  Transaction Software GmbH
  D 81739 Munich 

 *********************************************************/

/* Module begin */
#ifndef _TCIW_H
#define _TCIW_H

#define TCI_C_TCHAR TCI_C_WCHAR

#define TCIAllocEnvironment TCIAllocEnvironmentW
#define TCIAllocError TCIAllocErrorW
#define TCIAllocConnection TCIAllocConnectionW
#define TCIAllocTransaction TCIAllocTransactionW
#define TCIAllocStatement TCIAllocStatementW
#define TCIAllocResultSet TCIAllocResultSetW
#define TCIFreeEnvironment TCIFreeEnvironmentW
#define TCIFreeError TCIFreeErrorW
#define TCIFreeConnection TCIFreeConnectionW
#define TCIFreeTransaction TCIFreeTransactionW
#define TCIFreeStatement TCIFreeStatementW
#define TCIFreeResultSet TCIFreeResultSetW
#define TCIConnect TCIConnectW
#define TCIDisconnect TCIDisconnectW
#define TCILogin TCILoginW
#define TCIBeginTransaction TCIBeginTransactionW
#define TCICommitTransaction TCICommitTransactionW
#define TCIRollbackTransaction TCIRollbackTransactionW
#define TCIBreak TCIBreakW
#define TCIPrepare TCIPrepareW
#define TCIBindParameter TCIBindParameterW
#define TCIBindParameterByName TCIBindParameterByNameW
#define TCIUnbindParameters TCIUnbindParametersW
#define TCIExecute TCIExecuteW
#define TCIExecuteDirect TCIExecuteDirectW
#define TCIBindColumn TCIBindColumnW
#define TCIBindColumnByName TCIBindColumnByNameW
#define TCIUnbindColumns TCIUnbindColumnsW
#define TCIResetColumn TCIResetColumnW
#define TCIFetch TCIFetchW
#define TCIClose TCICloseW
#define TCISetData TCISetDataW
#define TCIGetData TCIGetDataW
#define TCIGetDataByName TCIGetDataByNameW
#define TCIGetError TCIGetErrorW
#define TCIGetEnvironmentError TCIGetEnvironmentErrorW
#define TCIGetEnvironmentAttribute TCIGetEnvironmentAttributeW
#define TCIGetErrorAttribute TCIGetErrorAttributeW
#define TCIGetConnectionAttribute TCIGetConnectionAttributeW
#define TCIGetTransactionAttribute TCIGetTransactionAttributeW
#define TCIGetStatementAttribute TCIGetStatementAttributeW
#define TCIGetResultSetAttribute TCIGetResultSetAttributeW
#define TCISetEnvironmentAttribute TCISetEnvironmentAttributeW
#define TCISetErrorAttribute TCISetErrorAttributeW
#define TCISetConnectionAttribute TCISetConnectionAttributeW
#define TCISetTransactionAttribute TCISetTransactionAttributeW
#define TCISetStatementAttribute TCISetStatementAttributeW
#define TCISetResultSetAttribute TCISetResultSetAttributeW
#endif

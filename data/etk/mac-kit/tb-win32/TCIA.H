/******************************************************** 

                      T r a n s B a s e / C D
  @(#) tcia.h:   V6.1.2.19 (Build 404)
		Project: 4.119.1.19
		2004/08/05 11:46:57

  Copyright (c) 1995 - 
  Transaction Software GmbH
  D 81739 Munich 

 *********************************************************/

/* Module begin */
#ifndef _TCIA_H
#define _TCIA_H

#define TCI_C_TCHAR TCI_C_SCHAR

#define TCIAllocEnvironment TCIAllocEnvironmentA
#define TCIAllocError TCIAllocErrorA
#define TCIAllocConnection TCIAllocConnectionA
#define TCIAllocTransaction TCIAllocTransactionA
#define TCIAllocStatement TCIAllocStatementA
#define TCIAllocResultSet TCIAllocResultSetA
#define TCIFreeEnvironment TCIFreeEnvironmentA
#define TCIFreeError TCIFreeErrorA
#define TCIFreeConnection TCIFreeConnectionA
#define TCIFreeTransaction TCIFreeTransactionA
#define TCIFreeStatement TCIFreeStatementA
#define TCIFreeResultSet TCIFreeResultSetA
#define TCIConnect TCIConnectA
#define TCIDisconnect TCIDisconnectA
#define TCILogin TCILoginA
#define TCIBeginTransaction TCIBeginTransactionA
#define TCICommitTransaction TCICommitTransactionA
#define TCIRollbackTransaction TCIRollbackTransactionA
#define TCIBreak TCIBreakA
#define TCIPrepare TCIPrepareA
#define TCIBindParameter TCIBindParameterA
#define TCIBindParameterByName TCIBindParameterByNameA
#define TCIUnbindParameters TCIUnbindParametersA
#define TCIExecute TCIExecuteA
#define TCIExecuteDirect TCIExecuteDirectA
#define TCIBindColumn TCIBindColumnA
#define TCIBindColumnByName TCIBindColumnByNameA
#define TCIUnbindColumns TCIUnbindColumnsA
#define TCIResetColumn TCIResetColumnA
#define TCIFetch TCIFetchA
#define TCIClose TCICloseA
#define TCISetData TCISetDataA
#define TCIGetData TCIGetDataA
#define TCIGetDataByName TCIGetDataByNameA
#define TCIGetError TCIGetErrorA
#define TCIGetEnvironmentError TCIGetEnvironmentErrorA
#define TCIGetEnvironmentAttribute TCIGetEnvironmentAttributeA
#define TCIGetErrorAttribute TCIGetErrorAttributeA
#define TCIGetConnectionAttribute TCIGetConnectionAttributeA
#define TCIGetTransactionAttribute TCIGetTransactionAttributeA
#define TCIGetStatementAttribute TCIGetStatementAttributeA
#define TCIGetResultSetAttribute TCIGetResultSetAttributeA
#define TCISetEnvironmentAttribute TCISetEnvironmentAttributeA
#define TCISetErrorAttribute TCISetErrorAttributeA
#define TCISetConnectionAttribute TCISetConnectionAttributeA
#define TCISetTransactionAttribute TCISetTransactionAttributeA
#define TCISetStatementAttribute TCISetStatementAttributeA
#define TCISetResultSetAttribute TCISetResultSetAttributeA
#endif

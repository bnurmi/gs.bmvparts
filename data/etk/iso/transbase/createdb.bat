%1\tbadm32 -cf etk_publ p=tmp h=%1\etk_publ typ=E ps=4096 lc=1024 rs=512000 d=,512000 cp=utf8 >> createdb.log
@set RTC=%ERRORLEVEL%
@if ERRORLEVEL 1 echo ERRORLEVEL set by  %1\tbadm32 -cf etk_publ

%1\tbadm32 -cf etk_nutzer p=tmp h=%1\etk_nutzer cp=utf8 >> createdb.log
@if ERRORLEVEL 1 echo ERRORLEVEL set by %1\tbadm32 -cf etk_nutzer

%1\tbadm32 -cf etk_preise p=tmp h=%1\etk_preise cp=utf8 >> createdb.log
@if ERRORLEVEL 1 echo ERRORLEVEL set by %1\tbadm32 -cf etk_preise

%1\tbi32 -f %1\webretknutzer_tb.sql etk_nutzer tbadmin tmp >> createdb.log
@if ERRORLEVEL 1 echo ERRORLEVEL set by %1\tbi32 -f %1\webretknutzer_tb.sql

%1\tbi32 -f %1\webretkpreise_tb.sql etk_preise tbadmin tmp >> createdb.log
@if ERRORLEVEL 1 echo ERRORLEVEL set by %1\tbi32 -f %1\webretkpreise_tb.sql

exit /b %RTC%

@rem Installation ETK
@echo on

@rem CG StS 20120229 - Use Java provided by separate package
set JAVA_HOME=p:\ETK\JRE
set PATH=%JAVA_HOME%\bin;%PATH%


@rem Zu lokalen Installation können die Laufwerke
@rem durch Pfade ersetzt werden
if NOT defined ibaseInstallDriveD (
	set DriveD=D:
	D:
) else (set DriveD=%ibaseInstallDriveD%)
if NOT defined ibaseInstallDriveL (set DriveL=L:) else (set DriveL=%ibaseInstallDriveL%)
if NOT defined ibaseInstallDriveP (set DriveP=P:) else (set DriveP=%ibaseInstallDriveP%)

cd %DriveD%

@rem Zum Test
@set stepwise=false
@set RTC=0

set tbadmCmd=%DriveP%\ETK\transbase\tbadm32.exe
set tbiCmd=%DriveP%\ETK\transbase\tbi32.exe
set tcCmd=call %DriveP%\ETK\tomcatEmbed\etkServerManager.cmd
set logFile=%DriveL%\ETK\ETK_Data_install.log

set ERRORLEVEL=0

@rem der msi-install wird immer übersprungen, da die Dateien entpackt vorliegen
@rem set arg1=%1

	@rem embedded tomcat anhalten
	%tcCmd% stop
	rem wait 4 sec for tomcat to stop ...
	@PING -n 5 127.0.0.1>nul
:dbImplement
	@if %stepwise% == true pause
	@rem datenbank löschen
	%tbadmCmd%  -df etk_publ
	@set RTC=%ERRORLEVEL%
	@if %RTC% NEQ 0		goto end 
	@if %stepwise% == true pause

	@rem version.txt kopieren, damit bei alleiniger Auslieferung der Daten,
	@rem der javaclient und das clientadmintool die richtige Version anzeigen
	Xcopy /i /q /r /y D:\ETK\Daten\version.txt P:\ETK
	Xcopy /i /q /r /y D:\ETK\Daten\version.txt P:\ETK\tomcatEmbed\webapps\javaserver\WEB-INF

	@rem ROM-Files einspielen
	@set rom=%DriveD%\ETK\Daten
	@set rom0=%rom%\rfile000.000
	@set rom1=%rom%\rfile000.001
	@set rom2=%rom%\rfile001.000
	%tbadmCmd% -Cf etk_publ h=%DriveP%\ETK\transbase\etk_publ cp=utf8 p=altabe rf=%rom0% rf=%rom1% rf=%rom2%
	@if ERRORLEVEL 1 echo ERRORLEVEL set by %tbadmCmd%
	@if %stepwise% == true pause

	net start transbase
	
	@rem do update script
	call %tbiCmd% -f %DriveD%\ETK\Daten\updateNutzerDaten.sql etk_nutzer tbadmin altabe
	@if ERRORLEVEL 1 echo ERRORLEVEL set by %tbiCmd% updateNutzerDaten.sql
	call %tbiCmd% -f %DriveD%\ETK\Daten\updatePublDaten.sql etk_publ tbadmin altabe
	@if ERRORLEVEL 1 echo ERRORLEVEL set by %tbiCmd% updatePublDaten.sql
	@if %stepwise% == true pause

	@rem embedded tomcat starten
	call %tcCmd% start

:end
exit /b %RTC%

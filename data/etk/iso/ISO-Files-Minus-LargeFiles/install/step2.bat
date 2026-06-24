echo off

rem Batch-Aktionen, welche vom JAVA-Installer aufgerufen werden

#TARGETDRIVE#

rem Client Dateien entpacken
if true==true cd #TARGETDIR#\javaclient
if true==true call jre_1.8.0_92.exe
rem Transbase entpacken
if #UPDATE#==false cd #TARGETDIR#\transbase
if #UPDATE#==false call transbase.exe
if #UPDATE#==false del transbase.exe

cd #TARGETDIR#

rem Tomcat als Service einrichten
if true==true call tomcat_service.bat

rem Transbase als Service einrichten
if #UPDATE#==false call transbase_service.bat
rem Tomcat wieder starten
rem if #TOMCATINSTALLED#==true if #UPDATE#==true net start "Tomcat"

rem Datenbank und Tabellen erzeugen
call transbase_db.bat

rem Shortcut fuer admintool
cd server_install
setup.exe /s /f1".\install_server.iss" /f2".\adm_inst_icon.log" #TARGETDIR#

cd #TARGETDIR#\admintool
rem Update EtkNutzer
if #UPDATE#==true java -classpath "..\javaclient\libs\log4j.jar;.;admintool.jar;tbjdbc.jar" webetk.admintool.framework.MainViewController Nutzerdaten #OLDVERSION#


echo *
echo **************************************************************************
echo *
echo * Please click OK to continue the installation.       
echo *
echo **************************************************************************

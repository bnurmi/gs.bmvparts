echo off

rem entfernt beim Deinstall die Services und dier Firmenverzeichnisse

#TARGETDRIVE#
cd #TARGETDIR#\admintool

java -classpath "..\javaclient\libs\log4j.jar;.;admintool.jar;tbjdbc.jar" webetk.admintool.framework.MainViewController DeleteAllFirmen

cd #TARGETDIR#

if #TOMCATSERVICE#==true call remove_tomcat_service.bat

call remove_transbase_service.bat

rem Shortcut fuer admintool
cd server_install
setup.exe /s /f1".\uninstall_server.iss" /f2".\adm_inst_icon.log"
cd ..

echo *
echo **************************************************************************
echo *
echo * Please click OK to contuinue the deinstaller.       
echo *
echo **************************************************************************

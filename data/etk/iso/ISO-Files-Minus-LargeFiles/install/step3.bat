echo off

rem Batch-Aktionen, welche vom JAVA-Installer aufgerufen werden

#TARGETDRIVE#

rem Migration
cd #TARGETDIR#\migration
if #UPDATE#==false java -classpath "..\javaclient\libs\log4j.jar;.;migration.jar;xmlapi.jar;tbjdbc.jar;commons-httpclient.jar;commons-logging.jar;jakarta-xerces.jar" webetk.migration.framework.MainViewController
rem RR Abfrage
if #UPDATE#==true java -classpath "..\javaclient\libs\log4j.jar;.;migration.jar;xmlapi.jar;tbjdbc.jar;commons-httpclient.jar;commons-logging.jar;jakarta-xerces.jar" webetk.migration.framework.MainViewController Update

rem Firmenverzeichnisse - muss nach der Migration passieren
rem if #UPDATE#==true echo Updating Client Directories ...
cd #TARGETDIR#\admintool
if #UPDATE#==true java -classpath "..\javaclient\libs\log4j.jar;.;admintool.jar;tbjdbc.jar" webetk.admintool.framework.MainViewController UpdateAllFirmen

rem Firmenverwaltung
cd #TARGETDIR#\admintool
if #UPDATE#==false java -classpath "..\javaclient\libs\log4j.jar;.;admintool.jar;tbjdbc.jar" webetk.admintool.framework.MainViewController Firma

rem ROM-File einspielen
java -classpath "..\javaclient\libs\log4j.jar;.;admintool.jar;tbjdbc.jar" webetk.admintool.framework.MainViewController Publikationsdaten

rem Migration (Anteile nach ROM-File einspielen)
cd #TARGETDIR#\migration
if #UPDATE#==false java -classpath "..\javaclient\libs\log4j.jar;.;migration.jar;xmlapi.jar;tbjdbc.jar;castor-xml.jar;commons-httpclient.jar;commons-logging.jar;jakarta-xerces.jar" webetk.migration.framework.MainViewController Anpassung


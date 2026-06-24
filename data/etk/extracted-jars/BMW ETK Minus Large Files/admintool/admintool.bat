if standalone == standalone ..\javaclient\jre1.8.0_92\bin\java -classpath ".;admintool.jar;..\javaclient\libs\log4j.jar;tbjdbc.jar"  webetk.admintool.framework.MainViewController %1 %2 %3
if clientserver == true java -classpath ".;admintool.jar;..\javaclient\libs\log4j.jar;tbjdbc.jar"  webetk.admintool.framework.MainViewController %1 %2 %3

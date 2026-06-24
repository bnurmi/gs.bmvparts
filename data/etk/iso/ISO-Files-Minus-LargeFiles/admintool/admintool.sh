cd `dirname $0`
. ../transbase/rc.tbenv

java -classpath "../javaclient/libs/log4j.jar:.:admintool.jar:tbjdbc.jar" webetk.admintool.framework.MainViewController

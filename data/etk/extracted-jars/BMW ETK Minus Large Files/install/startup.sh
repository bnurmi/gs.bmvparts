#!/bin/sh

logfile=scripte.log
exec >> $logfile 2>&1

DIR="$( cd "$( dirname "$0" )" && pwd )"
export DIR


echo "Ausgabe des startup.sh Scripts"
echo "Aufrufparameter: $1 und $2" 

export JAVA_HOME=$2
export LD_LIBRARY_PATH=`dirname $0`

echo "JAVA HOME" $JAVA_HOME
echo "LD_LIBRARY_PATH" $LD_LIBRARY_PATH

. "$1"/transbase/rc.tbenv

./rc.TransBase

echo "rc.TransBase ausgeführt"

./createdb.sh


#!/bin/bash
set -e
mkdir -p /tmp/kaggle_logs

echo "[batch] starting tn-mvr (230 MB)"
KAGGLE_REF="sheacon/tn-mvr-2018-2022" OS_KEY="seed/tn-mvr.zip" \
  node scripts/kaggle-stream-to-os.mjs 2>&1 | tee /tmp/kaggle_logs/tn-mvr.log

echo "[batch] starting marketcheck (440 MB)"
KAGGLE_REF="rupeshraundal/marketcheck-automotive-data-us-canada" OS_KEY="seed/marketcheck.zip" \
  node scripts/kaggle-stream-to-os.mjs 2>&1 | tee /tmp/kaggle_logs/marketcheck.log

echo "[batch] starting us-used-cars (2.3 GB)"
KAGGLE_REF="ananaymital/us-used-cars-dataset" OS_KEY="seed/us-used-cars.zip" \
  node scripts/kaggle-stream-to-os.mjs 2>&1 | tee /tmp/kaggle_logs/us-used-cars.log

echo "[batch] ALL DONE"
touch /tmp/kaggle_logs/all_done.txt

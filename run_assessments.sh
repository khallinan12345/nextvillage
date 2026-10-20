#!/bin/bash
# Assesses remaining African users one at a time.
# Skips users already in user_monthly_assessments for April.
# Safe to re-run — already-assessed users return "skipped" instantly.
#
# Run in background so terminal disconnect can't kill it:
#   nohup bash run_assessments.sh > assessment_log.txt 2>&1 &
#   tail -f assessment_log.txt

SECRET="6ad112ec5c77390594b5d2519d8ced2daf59db83919d4921bada3f7576417cbc"
BASE="https://www.nextvillage.community/api/assess-monthly"
START="2026-04-01"
END="2026-04-29"

# All 112 African user IDs — already-assessed ones will return "skipped" harmlessly
IDS=(
  "04d5d6ab-881f-4416-995b-29b080c71727"
  "0b9569b8-5161-46e0-8030-2dd661effc3f"
  "0bbe24ea-d4df-48ed-b532-e28abec43a5b"
  "0f6ff8dc-2ba5-4377-b708-e28b8492430f"
  "1031faf1-b161-4182-b352-f79b6f95d3eb"
  "13f8344c-5e85-45dd-9b2a-3a4890d73a93"
  "144544d5-5b87-441d-807a-0d68e683c3de"
  "163b593e-c489-41c2-88ac-2954adbc76be"
  "17e29db2-7b24-44ad-b3ae-8e2115af61b8"
  "27366929-7cd4-471a-9b01-efa7d5ef2853"
  "273d8556-1b9c-40de-913d-3bb175a6f90d"
  "29f2e717-1acc-40bc-8920-7c3645fb02d1"
  "2a106b9a-5432-43e3-8375-59c35aa45827"
  "2a308f91-5f6e-49d0-8116-8faf2ff281fb"
  "2bc9afad-fe34-407f-af08-4fcd9e0e86d7"
  "2d1f2bd2-87ac-4055-9baf-9f7b53089cb4"
  "3002c029-c89b-45e2-beca-70cd70a0ab9e"
  "320dd82b-e0b1-4aa5-b4b7-ab7688a1ab6b"
  "32e0c9c5-6d67-4ee4-9bb7-7101ad5d38e9"
  "344ac80f-3902-498b-9829-3a80d39cb117"
  "34ceaed3-c1f4-4121-95dd-9d4970e9591e"
  "35b5ade2-6e2a-4aa8-b87a-a74c2895a753"
  "38b4f3f5-72a8-4a8e-9dc2-c2c5b0c0caef"
  "3b788347-01cb-4e71-bdd5-216ac5a4cb29"
  "3e3f673b-cb8a-400e-8894-142c31554f9c"
  "47e39842-6784-4252-85b9-8e6b15cfc474"
  "481c7fda-a1f1-4679-995c-81b9453cb225"
  "4c261223-4606-464c-8fc8-046ddd06d3b6"
  "4d812afb-403c-4534-86d6-b0f481ea0e7c"
  "4ea63634-a4aa-4e97-aefe-a48a4da4728a"
  "4eb0968b-8170-46d8-8abe-3637e1f64cf4"
  "4f2c34a2-2c40-4bf2-8717-87878e417f00"
  "4f2e90e4-a8f8-40ae-b228-638db598154c"
  "4f82fe37-072f-40d4-803e-0a743737c3b6"
  "52747bcd-42ae-460a-9bab-19e000892cbc"
  "55b87ddf-cb4e-4f59-9612-041d4fb0cb01"
  "584d1199-6b33-40bc-98c3-5c2c8888e026"
  "5b82d9cb-d26c-48e7-9fcb-4fcc19177ead"
  "5ba9930d-0b50-475e-923a-0677fd9d59f7"
  "5d247a9f-7fad-47a1-8e90-71380df12dfd"
  "5dc6d007-b169-4c3a-94f1-7c24ff2efe04"
  "5ff2d195-f526-4888-8a2c-3324122bc3d8"
  "61b7328a-a130-410b-8141-de84bdc106a2"
  "63272f79-4cc3-4ad8-8fba-07ebade46b43"
  "63f207e8-5d4c-4fed-9edd-2a57e0d0dbd1"
  "686c3a50-5a4e-40fe-a3e4-e75827f84d8d"
  "6905c799-a499-44c7-9b43-991aa2bba9fa"
  "6c272f93-e26e-4520-acf3-d46db5084336"
  "6eacf130-f645-47a9-9a05-0552cd55c4fd"
  "6ef23f7b-a68e-434e-8f1f-64f6c0496276"
  "72b4683c-028d-4a46-9ffe-9b366a8b9d65"
  "75d73135-5a71-4f86-b2c3-a4f582dba17b"
  "76eee781-0f0a-4219-ab6c-927a5b5a6379"
  "7975ef0b-8ca5-4589-a367-988a8ef1d612"
  "7c8c094e-3761-41b1-9acc-90187f387db0"
  "8277ef60-6eca-48be-b8b3-4a8d0352e295"
  "83377caa-6fb6-4189-9e57-6c67549a3c39"
  "85b80b63-1b61-4f49-a3a8-3387aba17b39"
  "8b9bd0bf-57cb-4ff8-8f99-67b61058627b"
  "8d496537-bf3b-4444-b8c0-58edc2f1e8d7"
  "8d85e860-9806-4456-9f98-baec0697e003"
  "8dba8b29-dc68-48b3-8341-b85a35754dd6"
  "8ecd2e0a-6ad9-465a-8fa4-ea01386f7141"
  "90c5434e-d4ac-4c4e-835b-4bb204f9ba75"
  "920ebaa6-70b2-4479-92c6-5a9326cd46a8"
  "92c26b64-b849-44c0-9416-42c4540780d1"
  "9499d45c-0a93-45a4-a36c-971bf8099c9b"
  "963691bb-d117-4242-92e6-c1919a4aa727"
  "97866589-afa2-46a1-9315-6da357c5b2d5"
  "9813a30f-4aed-4131-9d99-b3ff567beb09"
  "982de30e-6a67-44e0-a849-ca74181ecee0"
  "9aea5b7b-62dc-4bdb-8e2a-6f5f46b3c36d"
  "9e1c3402-b89c-4ead-998e-cd1ff54c8629"
  "a1d3ad73-2370-4905-936d-f836039e8715"
  "a276cdac-ac5c-4a18-b1cc-aa9ca9fa59b3"
  "a3283762-0cf5-43f7-b48e-ee26c0d99e9e"
  "a438a6b0-011a-4520-8bb8-cde8446d948d"
  "a462170b-d969-4208-acd4-915344ac72d0"
  "a4e80723-a951-4ca9-b4d4-1c4975ebf693"
  "a55fce20-3054-4a90-a928-04c7b7e16b67"
  "a79977ee-80cb-420f-a9ac-aa1cf9022877"
  "a87931b1-25dc-4085-9e55-38add9b70ef6"
  "a89fbf0c-b26d-4ec0-8c9b-0d4794d45c09"
  "aa3b0683-1a42-494e-849d-96453fb76d1c"
  "aaa8269b-28f3-40b5-a66f-7d4cc21c5657"
  "ad29026f-e774-4da1-8a34-3b3042608954"
  "b06fa8b1-9b81-43ab-a8e4-79bd6002af02"
  "b2cb9a09-222f-44be-add4-f925a4e7a49c"
  "b39d4cd3-d36b-4859-9cf3-fdf45aa49480"
  "b54408d8-a753-4cea-8ed4-96dc4340e649"
  "b8d4ad50-a421-4cca-9498-81551a98a334"
  "ba1c0678-0149-4cf3-b591-908a3d2f6df2"
  "bb07da10-8190-4699-8abe-401dbceff84e"
  "bc8d67a2-1ce4-4c6f-81ca-48f9071f9d22"
  "bd338e79-e882-4d58-869c-7ef34e1c1188"
  "c5957dac-5ae7-4730-af89-2c74cfe3ac34"
  "c8318dce-8e37-4b54-995c-049f8365d052"
  "c8ff624d-00b5-4607-a8f8-5d714bd4917e"
  "c9f0000e-7e0a-40fb-9332-bb7f94a9c153"
  "caeb773c-3742-4b06-b70e-120fc5cfcb53"
  "ce41729c-3a6b-4e63-b81e-a54913ac52c4"
  "ce5e9b46-088f-4b87-9212-27cbd5a9cc61"
  "d166013b-7bb6-46d4-a6be-b115243b024a"
  "d4e7c502-1b67-4660-b4ad-d11c1eb16421"
  "d78ce4ee-dc07-4256-808c-b3eda264adfb"
  "d8cb9edc-3d29-47d3-bb1f-8b0dfbabc310"
  "dfb83d5e-4101-4bd4-9dc8-af6af9900ca1"
  "e01c948c-5864-44a7-9115-1a44ab0091f8"
  "e4bec634-fdae-4c9f-a154-62f2f1911c07"
  "e54fbf20-a807-47e2-98c0-9572b8e08498"
  "ec98c007-89fd-4c12-9cd6-868ce4e20ee2"
  "fcdd4984-b55e-4a04-ac38-bc6a41999787"
)

TOTAL=${#IDS[@]}
SUCCESS=0
SKIPPED=0
ERRORS=0
LOG="assessment_log_$(date +%Y%m%d_%H%M%S).txt"

echo "=====================================" | tee -a "$LOG"
echo "Assessment run started: $(date)"      | tee -a "$LOG"
echo "Total users: $TOTAL"                  | tee -a "$LOG"
echo "Log file: $LOG"                       | tee -a "$LOG"
echo "=====================================" | tee -a "$LOG"

for i in "${!IDS[@]}"; do
  ID="${IDS[$i]}"
  NUM=$((i + 1))

  # curl with 60s timeout per user — generous for large transcripts
  RESULT=$(curl -s --max-time 60 \
    "${BASE}?start=${START}&end=${END}&userId=${ID}" \
    -H "x-cron-secret: ${SECRET}" 2>/dev/null)

  STATUS=$(echo "$RESULT" | python3 -c \
    "import sys,json; d=json.load(sys.stdin); print(d.get('status','error'))" 2>/dev/null || echo "error")

  TIMESTAMP=$(date '+%H:%M:%S')

  if [ "$STATUS" = "success" ]; then
    SUCCESS=$((SUCCESS + 1))
    echo "[$TIMESTAMP] [$NUM/$TOTAL] ✅ $ID — assessed" | tee -a "$LOG"
  elif [ "$STATUS" = "skipped" ] || [ "$STATUS" = "no_activity" ]; then
    SKIPPED=$((SKIPPED + 1))
    echo "[$TIMESTAMP] [$NUM/$TOTAL] ⏭  $ID — $STATUS" | tee -a "$LOG"
  else
    ERRORS=$((ERRORS + 1))
    echo "[$TIMESTAMP] [$NUM/$TOTAL] ❌ $ID — $STATUS" | tee -a "$LOG"
    echo "    Response: $RESULT" | tee -a "$LOG"
  fi

  # 2s pause between users — avoids hammering Supabase connection pool
  sleep 2
done

echo "" | tee -a "$LOG"
echo "=====================================" | tee -a "$LOG"
echo "Done: $(date)"                         | tee -a "$LOG"
echo "✅ Assessed : $SUCCESS"                | tee -a "$LOG"
echo "⏭  Skipped  : $SKIPPED"               | tee -a "$LOG"
echo "❌ Errors   : $ERRORS"                 | tee -a "$LOG"
echo "=====================================" | tee -a "$LOG"
echo "" | tee -a "$LOG"
echo "Now send the full report email:" | tee -a "$LOG"
echo "curl -s \"${BASE}?start=${START}&end=${END}&mode=report\" \\" | tee -a "$LOG"
echo "  -H \"x-cron-secret: ${SECRET}\" | python3 -m json.tool" | tee -a "$LOG"

NEW3 R18, 2 September 2026. Output of docs/ai/new3-r18/probe-matters-parties.mts against the local
development database at HEAD 13f558d1. The body sent is byte-for-byte what
apps/mobile/src/screens/matter/NewMatterScreen.tsx sends. The probe seeds and deletes its
own advocate; nothing it creates survives the run.

POST status              = 201
POST parties typeof      = string
POST parties raw         = "{\"description\":\"Ramesh Kumar v. State of NCT of Delhi\"}"
POST parties.description = undefined
GET  status              = 200
GET  parties typeof      = string
GET  parties raw         = "{\"description\":\"Ramesh Kumar v. State of NCT of Delhi\"}"
GET  parties.description = undefined
STORED jsonb_typeof      = string
LIST parties typeof      = string

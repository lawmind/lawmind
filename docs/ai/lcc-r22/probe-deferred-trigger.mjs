/* Does a DEFERRABLE INITIALLY DEFERRED AFTER-INSERT row trigger see the row as
   it was at INSERT time, or as it is at COMMIT time after a later UPDATE? */
import { readFileSync } from 'node:fs';
import postgres from 'postgres';
const url = (/^LOCAL_DATABASE_URL=(.+)$/m.exec(readFileSync('.env','utf8')) ?? [])[1].trim();
const sql = postgres(url, { max: 2, onnotice: () => {} });
const T = `probe_trg_${Date.now().toString(36)}`;
await sql.unsafe(`CREATE TABLE ${T}(id serial primary key, done text)`);
await sql.unsafe(`CREATE FUNCTION ${T}_f() RETURNS trigger AS $x$
BEGIN
  RAISE NOTICE 'TRIGGER FIRED: NEW.done=% ; live.done=%',
    NEW.done, (SELECT done FROM ${T} WHERE id = NEW.id);
  RETURN NULL;
END; $x$ LANGUAGE plpgsql`);
await sql.unsafe(`CREATE CONSTRAINT TRIGGER ${T}_t AFTER INSERT OR UPDATE ON ${T}
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ${T}_f()`);
const notices = [];
const s2 = postgres(url, { max: 1, onnotice: (n) => notices.push(n.message) });
await s2.begin(async (tx) => {
  const [r] = await tx.unsafe(`INSERT INTO ${T}(done) VALUES (NULL) RETURNING id`);
  await tx.unsafe(`UPDATE ${T} SET done = 'yes' WHERE id = ${r.id}`);
});
console.log(notices.join('\n'));
await sql.unsafe(`DROP TABLE ${T}`); await sql.unsafe(`DROP FUNCTION ${T}_f()`);
await sql.end(); await s2.end();

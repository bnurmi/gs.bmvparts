import { Client } from "@replit/object-storage";
const os = new Client();
async function main() {
  const result = await os.list();
  if (!result.ok) { console.error("list failed:", result.error); process.exit(1); }
  const objs = result.value.filter(o => !o.name.startsWith("images/"));
  objs.sort((a,b) => (b.size||0)-(a.size||0));
  for (const o of objs) {
    const gb = ((o.size||0)/1024/1024/1024).toFixed(3);
    console.log(`${gb} GB  ${o.name}`);
  }
  console.log(`\nNon-image objects: ${objs.length}`);
}
main().catch(e => { console.error(e); process.exit(1); });

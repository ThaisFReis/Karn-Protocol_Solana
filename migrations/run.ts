import * as anchor from "@coral-xyz/anchor";
const fn = require("./deploy");
const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);
fn(provider).catch((e: any) => { console.error(e); process.exit(1); });

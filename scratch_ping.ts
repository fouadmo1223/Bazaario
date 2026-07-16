import mongoose from "mongoose";
async function main(){
  try {
    await mongoose.connect(process.env.MONGODB_URI!, { dbName:"commerce", serverSelectionTimeoutMS: 15000 });
    console.log("ATLAS OK, readyState:", mongoose.connection.readyState);
    await mongoose.disconnect();
  } catch(e){ console.log("ATLAS FAIL:", (e as Error).message.slice(0,120)); }
  process.exit(0);
}
main();

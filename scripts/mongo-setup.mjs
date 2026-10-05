import {connect,setup} from './mongo-common.mjs';
const {client,db}=await connect();try{await setup(db);console.log('Collections, unique indexes and transaction control are ready. No accounts or demo data were added.')}finally{await client.close()}

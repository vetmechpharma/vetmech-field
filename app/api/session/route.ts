import {member,json,failure} from '../../../lib/server';
export async function GET(){try{return json({member:await member()})}catch(e){return failure(e)}}

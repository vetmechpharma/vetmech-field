import sharp from 'sharp';
import {HttpError} from './http-input';

export const MAX_PHOTO_DATA_URL=175000;

/** Accept image bytes only; never paths/URLs. Re-encode to discard metadata. */
export async function normalizeEmployeePhoto(value:string){
 const match=/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
 if(!match||value.length>MAX_PHOTO_DATA_URL)throw new HttpError(400,'Choose a JPG, PNG or WebP employee photo.');
 const input=Buffer.from(match[2],'base64');
 if(!input.length||input.length>128*1024||input.toString('base64')!==match[2])throw new HttpError(400,'Photo is too large or invalid. Choose it again to resize it.');
 const format=input.subarray(0,3).equals(Buffer.from([255,216,255]))?'jpeg':input.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'png':input.toString('ascii',0,4)==='RIFF'&&input.toString('ascii',8,12)==='WEBP'?'webp':'';
 if(format!==match[1])throw new HttpError(400,'The photo format does not match its contents.');
 try{
  const image=sharp(input,{limitInputPixels:4*1024*1024,failOn:'warning'});
  const metadata=await image.metadata();
  if((metadata.pages||1)>1)throw new Error('Animated photo');
  const output=await image.rotate().resize(256,256,{fit:'cover',position:'centre'}).flatten({background:'#ffffff'}).webp({quality:80}).toBuffer();
  if(output.length>96*1024)throw new Error('Oversized output');
  return {imageBase64:output.toString('base64'),version:crypto.randomUUID()};
 }catch{throw new HttpError(400,'Unable to read this photo. Choose a still JPG, PNG or WebP image.');}
}

/** India is the default. Strip country prefixes only when a full 10-digit national number remains. */
export function customerPhone(raw:string){
 const value=String(raw||'').trim();if(!value)return '';
 if(!/^[+\d\s().-]+$/.test(value))return value;
 let digits=value.replace(/\D/g,'');
 if(digits.startsWith('0091'))digits=digits.slice(2);
 while(digits.length>10&&digits.startsWith('91')&&(digits.length-10)%2===0)digits=digits.slice(2);
 if(digits.length===11&&digits.startsWith('0'))digits=digits.slice(1);
 if(digits.length===10)return '+91'+digits;
 // Preserve explicitly international numbers rather than silently changing their country.
 return value;
}

/** Month boundaries follow Asia/Kolkata, supplied by the server's indiaDay(). */
export function orderChangeBlock(role:string,orderDate:string,today:string,closedMonths:string[]=[]){
 const month=orderDate.slice(0,7);
 if(closedMonths.some(closed=>closed>=month))return 'Month locked by Admin. Order changes are not allowed.';
 if(role==='mr'&&month!==today.slice(0,7))return 'MR orders can be edited or cancelled only within the original order month.';
 return '';
}

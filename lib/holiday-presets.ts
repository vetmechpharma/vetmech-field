import type {Holiday} from './monthly-tour';
// Central government Delhi/New Delhi gazetted schedule, with the separately notified
// Ambedkar holiday and May 2026 Id-ul-Zuha amendment. Admin confirms regional applicability.
export const holidayPresetSources=[
 'https://www.incometaxindia.gov.in/documents/d/guest/departmental-directory2026-1',
 'https://dopt.gov.in/sites/default/files/Declaration%20of%20Holiday%20on%2014.04.2026%20-%20Birthday%20of%20Dr.%20B.R.%20Ambedkar.pdf',
 'https://dopt.gov.in/sites/default/files/Change%20in%20the%20date%20of%20holiday%20of%20Id-ul-Zuha.PDF',
];
export function centralHolidayPreset(year:string):Holiday[]|null{
 if(year!=='2026')return null;
 return [['01-26','Republic Day'],['03-04','Holi'],['03-21','Id-ul-Fitr'],['03-26','Ram Navami'],['03-31','Mahavir Jayanti'],['04-03','Good Friday'],['04-14','Dr. B. R. Ambedkar’s Birthday'],['05-01','Buddha Purnima'],['05-28','Id-ul-Zuha (amended date)'],['06-26','Muharram'],['08-15','Independence Day'],['08-26','Id-e-Milad'],['09-04','Janmashtami'],['10-02','Gandhi Jayanti'],['10-20','Dussehra'],['11-08','Diwali'],['11-24','Guru Nanak’s Birthday'],['12-25','Christmas Day']].map(([date,name])=>({date:year+'-'+date,name}));
}

export const MAX_FILES=5000;
export const MAX_BYTES=200*1024*1024;
const groups={Images:'jpg jpeg png gif webp avif heic heif svg bmp tiff tif ico raw',Documents:'pdf doc docx odt rtf txt md tex',Spreadsheets:'xls xlsx xlsm csv tsv ods',Presentations:'ppt pptx odp key',Videos:'mp4 mov avi mkv webm m4v wmv',Audio:'mp3 wav aac flac ogg m4a aiff',Archives:'zip rar 7z tar gz bz2 xz',Code:'js ts jsx tsx py java c cpp h cs go rs rb php html css json yaml yml xml sql sh ipynb',Design:'psd ai eps fig sketch xd indd'};
export function extension(name){const dot=name.lastIndexOf('.');return dot>0&&dot<name.length-1?name.slice(dot+1).toLowerCase():'';}
export function safeName(name){let result=String(name).normalize('NFC').replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g,'_').replace(/[. ]+$/g,'').trim();if(!result||result==='.'||result==='..')result='Unnamed';if(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(result))result='_'+result;return result.slice(0,180);}
export function category(name){const ext=extension(name);return Object.entries(groups).find(([,values])=>values.split(' ').includes(ext))?.[0]||'Other';}
/** @param {File[]} files */
export function planFiles(files,mode='type',keepFolders=false){
 if(files.length>MAX_FILES)throw Error('Choose up to 5,000 files at a time.');
 if(files.reduce((s,f)=>s+f.size,0)>MAX_BYTES)throw Error('Choose a folder smaller than 200 MB, or organise it in smaller parts.');
 if(!['type','extension','month'].includes(mode))throw Error('Choose a valid sorting method.');
 const used=new Set();
 return files.map((file,index)=>({file,index,original:file.webkitRelativePath||file.name})).sort((a,b)=>a.original<b.original?-1:a.original>b.original?1:a.index-b.index).map(row=>{
  const ext=extension(row.file.name),date=new Date(row.file.lastModified);
  const group=mode==='type'?category(row.file.name):mode==='extension'?(ext?safeName(ext.toUpperCase()):'No extension'):(row.file.lastModified>0&&Number.isFinite(date.getTime())?date.toISOString().slice(0,7):'Unknown date');
  const parents=keepFolders?row.original.split('/').slice(1,-1).map(safeName):[];
  const prefix=[group,...parents].join('/');const name=safeName(row.file.name);const dot=name.lastIndexOf('.');const stem=dot>0?name.slice(0,dot):name,suffix=dot>0?name.slice(dot):'';
  let destination=prefix+'/'+name,count=2;while(used.has(destination.toLowerCase()))destination=prefix+'/'+stem+' ('+(count++)+')'+suffix;
  used.add(destination.toLowerCase());return {...row,destination,group,renamed:destination.split('/').at(-1)!==row.file.name};
 });
}
const crcTable=Array.from({length:256},(_,value)=>{for(let i=0;i<8;i++)value=value&1?0xedb88320^(value>>>1):value>>>1;return value>>>0;});
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
function check(signal){if(signal?.aborted)throw Error('Download cancelled. Your files are unchanged.');}
function header(size){const bytes=new Uint8Array(size);return {bytes,view:new DataView(bytes.buffer)};}
// Standard ZIP with stored entries. Content stays in the browser; no compression
// or filesystem mutation. UTF-8 names and collision-safe paths are preserved.
/**
 * @param {ReturnType<typeof planFiles>} rows
 * @param {{signal?: AbortSignal, onProgress?: (done: number, total: number) => void}} options
 */
export async function createOrganisedZip(rows,{signal,onProgress=()=>{}}={}){
 if(!rows.length)throw Error('Choose files first.');
 if(rows.length>MAX_FILES||rows.reduce((n,r)=>n+r.file.size,0)>MAX_BYTES)throw Error('Folder exceeds the download limit.');
 const local=[],central=[];let offset=0;
 for(let index=0;index<rows.length;index++){
  check(signal);const row=rows[index],name=new TextEncoder().encode(row.destination);
  if(!row.destination||row.destination.startsWith('/')||row.destination.split('/').some(p=>!p||p==='.'||p==='..')||name.length>65535)throw Error('Invalid output path.');
  const data=new Uint8Array(await row.file.arrayBuffer());check(signal);
  let crc=0xffffffff;for(let start=0;start<data.length;start+=1048576){for(let i=start;i<Math.min(start+1048576,data.length);i++)crc=crcTable[(crc^data[i])&255]^(crc>>>8);await tick();check(signal);}crc=(crc^0xffffffff)>>>0;
  const date=new Date(row.file.lastModified);const valid=Number.isFinite(date.getTime())&&date.getUTCFullYear()>=1980&&date.getUTCFullYear()<=2107;
  const time=valid?(date.getUTCHours()<<11)|(date.getUTCMinutes()<<5)|(date.getUTCSeconds()>>1):0;
  const day=valid?((date.getUTCFullYear()-1980)<<9)|((date.getUTCMonth()+1)<<5)|date.getUTCDate():33;
  const h=header(30);h.view.setUint32(0,0x04034b50,true);h.view.setUint16(4,20,true);h.view.setUint16(6,0x800,true);h.view.setUint16(10,time,true);h.view.setUint16(12,day,true);h.view.setUint32(14,crc,true);h.view.setUint32(18,data.length,true);h.view.setUint32(22,data.length,true);h.view.setUint16(26,name.length,true);
  local.push(h.bytes,name,data);
  const c=header(46);c.view.setUint32(0,0x02014b50,true);c.view.setUint16(4,20,true);c.view.setUint16(6,20,true);c.view.setUint16(8,0x800,true);c.view.setUint16(12,time,true);c.view.setUint16(14,day,true);c.view.setUint32(16,crc,true);c.view.setUint32(20,data.length,true);c.view.setUint32(24,data.length,true);c.view.setUint16(28,name.length,true);c.view.setUint32(42,offset,true);central.push(c.bytes,name);
  offset+=30+name.length+data.length;onProgress(index+1,rows.length);await tick();
 }
 check(signal);const size=central.reduce((sum,b)=>sum+b.length,0),end=header(22);end.view.setUint32(0,0x06054b50,true);end.view.setUint16(8,rows.length,true);end.view.setUint16(10,rows.length,true);end.view.setUint32(12,size,true);end.view.setUint32(16,offset,true);
 return new Blob([...local,...central,end.bytes],{type:'application/zip'});
}

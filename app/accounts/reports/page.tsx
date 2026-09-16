import { getRawDb } from "../../../db";
import { requireChatGPTUser } from "../../company-auth";
import CommonsAssistant from "../../components/commons-assistant";
import { CORE_ACCOUNTS } from "../../lib/accounting";

export const dynamic = "force-dynamic";
const money=(paise:number)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(paise/100);
const validDate=(value:string|undefined)=>/^\d{4}-\d{2}-\d{2}$/.test(value||"")?value!:null;
function fiscalStart(today:string){const year=Number(today.slice(0,4)),month=Number(today.slice(5,7));return `${month>=4?year:year-1}-04-01`;}
type Row={account_code:string;account_name:string;category:string|null;normal_side:string|null;debits:number;credits:number};
type CashRow={source_type:string;inflow:number;outflow:number};

export default async function BookReportsPage({searchParams}:{searchParams:Promise<{from?:string;to?:string}>}){
  const user=await requireChatGPTUser("/accounts/reports");
  const params=await searchParams,today=new Date().toISOString().slice(0,10);
  const from=validDate(params.from)||fiscalStart(today),to=validDate(params.to)||today;
  const raw=getRawDb();
  let asOf:Row[]=[],period:Row[]=[],cash:CashRow[]=[],openingCash=0,entryCount=0;
  try{
    const results=await raw.batch([
      raw.prepare(`SELECT jl.account_code,jl.account_name,la.category,la.normal_side,SUM(jl.debit_paise) debits,SUM(jl.credit_paise) credits FROM journal_lines jl JOIN journal_entries je ON je.id=jl.entry_id AND je.owner_user_id=jl.owner_user_id LEFT JOIN ledger_accounts la ON la.owner_user_id=jl.owner_user_id AND la.code=jl.account_code WHERE jl.owner_user_id=? AND je.status='posted' AND je.entry_date<=? GROUP BY jl.account_code,jl.account_name,la.category,la.normal_side ORDER BY jl.account_code`).bind(user.id,to),
      raw.prepare(`SELECT jl.account_code,jl.account_name,la.category,la.normal_side,SUM(jl.debit_paise) debits,SUM(jl.credit_paise) credits FROM journal_lines jl JOIN journal_entries je ON je.id=jl.entry_id AND je.owner_user_id=jl.owner_user_id LEFT JOIN ledger_accounts la ON la.owner_user_id=jl.owner_user_id AND la.code=jl.account_code WHERE jl.owner_user_id=? AND je.status='posted' AND je.source_type!='year_end_close' AND je.entry_date BETWEEN ? AND ? GROUP BY jl.account_code,jl.account_name,la.category,la.normal_side ORDER BY jl.account_code`).bind(user.id,from,to),
      raw.prepare(`SELECT je.source_type,SUM(CASE WHEN jl.debit_paise>0 THEN jl.debit_paise ELSE 0 END) inflow,SUM(CASE WHEN jl.credit_paise>0 THEN jl.credit_paise ELSE 0 END) outflow FROM journal_lines jl JOIN journal_entries je ON je.id=jl.entry_id AND je.owner_user_id=jl.owner_user_id WHERE jl.owner_user_id=? AND jl.account_code IN ('1000','1010') AND je.status='posted' AND je.source_type!='transfer' AND je.entry_date BETWEEN ? AND ? GROUP BY je.source_type ORDER BY je.source_type`).bind(user.id,from,to),
      raw.prepare(`SELECT COALESCE(SUM(jl.debit_paise-jl.credit_paise),0) balance FROM journal_lines jl JOIN journal_entries je ON je.id=jl.entry_id AND je.owner_user_id=jl.owner_user_id WHERE jl.owner_user_id=? AND jl.account_code IN ('1000','1010') AND je.status='posted' AND je.entry_date<?`).bind(user.id,from),
      raw.prepare("SELECT COUNT(*) count FROM journal_entries WHERE owner_user_id=? AND status='posted' AND entry_date BETWEEN ? AND ?").bind(user.id,from,to),
    ]);
    asOf=results[0].results as Row[];period=results[1].results as Row[];cash=results[2].results as CashRow[];openingCash=Number((results[3].results?.[0] as {balance?:number})?.balance||0);entryCount=Number((results[4].results?.[0] as {count?:number})?.count||0);
  }catch(error){console.error("Book reports unavailable",error)}
  const core=new Map<string,(typeof CORE_ACCOUNTS)[number]>(CORE_ACCOUNTS.map(item=>[item.code,item]));
  const meta=(row:Row)=>({category:row.category||core.get(row.account_code)?.category||"unclassified",normalSide:row.normal_side||core.get(row.account_code)?.normalSide||"debit"});
  const natural=(row:Row)=>["liability","equity","income"].includes(meta(row).category)?row.credits-row.debits:row.debits-row.credits;
  const sum=(rows:Row[],category:string)=>rows.filter(row=>meta(row).category===category).reduce((total,row)=>total+natural(row),0);
  const periodIncome=sum(period,"income"),periodExpenses=sum(period,"expense"),periodProfit=periodIncome-periodExpenses;
  const assets=sum(asOf,"asset"),liabilities=sum(asOf,"liability"),equity=sum(asOf,"equity"),retained=sum(asOf,"income")-sum(asOf,"expense");
  const inflow=cash.reduce((total,row)=>total+Number(row.inflow||0),0),outflow=cash.reduce((total,row)=>total+Number(row.outflow||0),0),closingCash=openingCash+inflow-outflow;
  const trial=asOf.map(row=>{const balance=row.debits-row.credits;return {...row,closingDebit:Math.max(0,balance),closingCredit:Math.max(0,-balance)}}).filter(row=>row.closingDebit||row.closingCredit);
  const trialDebit=trial.reduce((s,row)=>s+row.closingDebit,0),trialCredit=trial.reduce((s,row)=>s+row.closingCredit,0);
  return <main className="form-shell"><section className="customer-form-wrap accounting-surface reports-surface">
    <a className="back-link" href="/accounts">← Commons Books</a>
    <div className="surface-heading report-title"><div><span>Business reports</span><h1>Accounts for the period.</h1></div><div className="books-status"><b>{trialDebit===trialCredit?"Books balanced":"Balance needs review"}</b><small>{entryCount} posted entries · {from} to {to}</small></div></div>
    <form className="report-period" method="get"><label><span>From</span><input type="date" name="from" defaultValue={from}/></label><label><span>To</span><input type="date" name="to" defaultValue={to}/></label><button type="submit">Refresh reports</button></form>
    {!entryCount&&<div className="directory-notice neutral">No posted accounting entries were found in this period. Change the dates or record a business event.</div>}
    <div className="report-tabs"><a href="#profit">Profit</a><a href="#position">Position</a><a href="#cash">Cash flow</a><a href="#trial">Trial balance</a></div>
    <section className="statement-card" id="profit"><header><span>Profit & loss</span><small>{from} to {to}</small></header><div className="statement-hero"><small>Profit before tax</small><strong>{money(periodProfit)}</strong></div><dl><div><dt>Income</dt><dd>{money(periodIncome)}</dd></div><div><dt>Expenses and cost of sales</dt><dd>- {money(periodExpenses)}</dd></div><div className="total"><dt>Profit before tax</dt><dd>{money(periodProfit)}</dd></div></dl></section>
    <section className="statement-card" id="position"><header><span>Balance sheet</span><small>As at {to}</small></header><dl><div><dt>Assets</dt><dd>{money(assets)}</dd></div><div><dt>Liabilities</dt><dd>{money(liabilities)}</dd></div><div><dt>Owner equity</dt><dd>{money(equity)}</dd></div><div><dt>Retained profit / loss</dt><dd>{money(retained)}</dd></div><div className="total"><dt>Balance check</dt><dd>{money(assets-liabilities-equity-retained)}</dd></div></dl></section>
    <section className="statement-card" id="cash"><header><span>Direct cash flow</span><small>{from} to {to}</small></header><dl><div><dt>Opening cash and bank</dt><dd>{money(openingCash)}</dd></div><div><dt>Cash received</dt><dd>{money(inflow)}</dd></div><div><dt>Cash paid</dt><dd>- {money(outflow)}</dd></div><div><dt>Net cash movement</dt><dd>{money(inflow-outflow)}</dd></div><div className="total"><dt>Closing cash and bank</dt><dd>{money(closingCash)}</dd></div></dl>{cash.length>0&&<div className="cash-flow-breakdown">{cash.map(row=><p key={row.source_type}><span>{row.source_type.replaceAll("_"," ")}</span><b>{money(Number(row.inflow||0)-Number(row.outflow||0))}</b></p>)}</div>}</section>
    <section className="statement-card trial-balance" id="trial"><header><span>Closing trial balance</span><small>As at {to}</small></header><div className="trial-head"><span>Account</span><span>Debit</span><span>Credit</span></div>{trial.map(row=><div className="trial-row" key={row.account_code}><span><b>{row.account_code}</b>{row.account_name}<small>{meta(row).category}</small></span><span>{row.closingDebit?money(row.closingDebit):"—"}</span><span>{row.closingCredit?money(row.closingCredit):"—"}</span></div>)}<div className="trial-row total"><span>Total</span><span>{money(trialDebit)}</span><span>{money(trialCredit)}</span></div></section>
    <p className="professional-note">All active custom ledger accounts are included. Review classifications, year-end adjustments, GST eligibility and statutory presentation with your accountant before filing.</p>
  </section><CommonsAssistant context="accounts"/></main>;
}

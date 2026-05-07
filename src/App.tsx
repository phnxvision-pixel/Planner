import React, { useState, useEffect, useRef } from 'react';
import { extractTransactionsFromImage } from './lib/gemini';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from 'recharts';
import { 
  PlusCircle, 
  Upload, 
  ChevronLeft, 
  ChevronRight, 
  Wallet, 
  TrendingDown, 
  TrendingUp, 
  Trash2,
  Loader2,
  LogOut
} from 'lucide-react';
import { useFirebase } from './components/FirebaseProvider';
import { db, handleFirestoreError, OperationType } from './lib/firebase';
import { collection, doc, setDoc, deleteDoc, onSnapshot, getDoc, serverTimestamp } from 'firebase/firestore';

export const CATEGORIES = [
  "Wohnen",
  "Essen & Trinken",
  "Freizeit & Shopping",
  "Transport",
  "Abos & Verträge",
  "Sonstiges"
];

type TransactionType = 'income' | 'expense';

interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: TransactionType;
  category?: string;
  reference?: string;
}

export default function App() {
  const { user, loading, signIn, signOut } = useFirebase();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  
  const [currentDate, setCurrentDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  // Form states
  const [dateInput, setDateInput] = useState(new Date().toISOString().split('T')[0]);
  const [descInput, setDescInput] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [typeInput, setTypeInput] = useState<TransactionType>('expense');
  const [categoryInput, setCategoryInput] = useState<string>('Sonstiges');
  const [isUploading, setIsUploading] = useState(false);

  // Planner states
  const [totalAmount, setTotalAmount] = useState('');
  const [installments, setInstallments] = useState('4');
  const [period, setPeriod] = useState<'weeks' | 'months'>('weeks');
  const [allowanceName, setAllowanceName] = useState('Kindergeld');

  // Budget & Balances states
  const [budgets, setBudgets] = useState<Record<string, number>>({});
  const [openingBalances, setOpeningBalances] = useState<Record<string, number>>({});
  
  // Upload report state
  const [uploadReport, setUploadReport] = useState<{
    show: boolean;
    totalExtracted: number;
    skipped: number;
    openingBalance: number | null;
    closingBalance: number | null;
    statementMonth: string | null;
    fileReports: { fileName: string; status: 'übertragen' | 'nicht übertragen' | 'nicht lesbar' | 'Fehler' }[];
  }>({ show: false, totalExtracted: 0, skipped: 0, openingBalance: null, closingBalance: null, statementMonth: null, fileReports: [] });
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync to Firestore
  useEffect(() => {
    if (!user) return;
    
    const unsubscribeTxs = onSnapshot(collection(db, `users/${user.uid}/transactions`), (snapshot) => {
      const txs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Transaction[];
      setTransactions(txs);
    }, (error) => handleFirestoreError(error, OperationType.GET, `users/${user.uid}/transactions`));

    const unsubscribePlanner = onSnapshot(doc(db, `users/${user.uid}/settings/planner`), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setTotalAmount(data.totalAmount || '');
        setInstallments(data.installments || '4');
        setPeriod(data.period || 'weeks');
        setAllowanceName(data.allowanceName || 'Kindergeld');
      }
    }, (error) => handleFirestoreError(error, OperationType.GET, `users/${user.uid}/settings/planner`));
    
    const unsubscribeBudgets = onSnapshot(doc(db, `users/${user.uid}/settings/budget`), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setBudgets(data.budgets || {});
        setOpeningBalances(data.openingBalances || {});
      }
    }, (error) => handleFirestoreError(error, OperationType.GET, `users/${user.uid}/settings/budget`));
    
    return () => {
      unsubscribeTxs();
      unsubscribePlanner();
      unsubscribeBudgets();
    }
  }, [user]);

  useEffect(() => {
    if (!user || loading) return;
    const savePlanner = async () => {
      try {
        await setDoc(doc(db, `users/${user.uid}/settings/planner`), {
          userId: user.uid,
          totalAmount,
          installments,
          period,
          allowanceName,
          updatedAt: serverTimestamp()
        });
      } catch (e: any) {
        if (!e.message?.includes('Missing or insufficient permissions')) {
          handleFirestoreError(e, OperationType.WRITE, `users/${user.uid}/settings/planner`);
        }
      }
    }
    const timeout = setTimeout(savePlanner, 500);
    return () => clearTimeout(timeout);
  }, [totalAmount, installments, period, allowanceName, user, loading]);


  useEffect(() => {
    if (!user || loading) return;
    const saveBudgets = async () => {
      try {
        await setDoc(doc(db, `users/${user.uid}/settings/budget`), {
          userId: user.uid,
          budgets,
          openingBalances,
          updatedAt: serverTimestamp()
        }, { merge: true });
      } catch (e: any) {
        if (!e.message?.includes('Missing or insufficient permissions')) {
          handleFirestoreError(e, OperationType.WRITE, `users/${user.uid}/settings/budget`);
        }
      }
    }
    const timeout = setTimeout(saveBudgets, 500);
    return () => clearTimeout(timeout);
  }, [budgets, openingBalances, user, loading]);

  if (loading) {
     return <div className="h-screen flex items-center justify-center bg-zinc-950 text-zinc-100"><Loader2 className="w-8 h-8 animate-spin text-emerald-500" /></div>;
  }

  if (!user) {
    return (
      <div className="h-screen flex items-center justify-center bg-zinc-950 text-zinc-100">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto bg-emerald-500 rounded-2xl flex items-center justify-center mb-6">
            <span className="text-3xl font-bold text-zinc-950">P</span>
          </div>
          <h1 className="text-3xl font-bold mb-2">Planner <span className="text-emerald-500">Niklas</span></h1>
          <p className="text-zinc-400 mb-8 max-w-sm">Dein persönlicher Finanzmanager. Melde dich an, um deine Einnahmen und Ausgaben dauerhaft und sicher zu speichern.</p>
          <button 
            onClick={signIn}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-3 px-8 rounded-xl transition"
          >
            Mit Google anmelden
          </button>
        </div>
      </div>
    );
  }

  const totalNum = parseFloat(totalAmount) || 0;
  const instNum = parseInt(installments) || 1;
  const perPeriod = totalNum / instNum;

  const calculateTransactionHash = async (uid: string, tx: Partial<Transaction>) => {
    const msg = `${uid}|${tx.date}|${tx.amount}|${tx.type}|${tx.reference || tx.description}`;
    const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(msg));
    const hashArray = Array.from(new Uint8Array(buffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex.substring(0, 32);
  };

  const addAllowanceTransaction = async () => {
    if (perPeriod <= 0 || !user) return;
    const newTx = {
      userId: user.uid,
      date: new Date().toISOString().split('T')[0],
      description: `${allowanceName || 'Einnahme'} gestaffelt`,
      amount: perPeriod,
      type: 'income' as const,
      category: 'Sonstiges',
      createdAt: serverTimestamp()
    };
    try {
      const id = await calculateTransactionHash(user.uid, newTx);
      await setDoc(doc(db, `users/${user.uid}/transactions/${id}`), newTx);
      alert(`Einnahme von ${formatCurrency(perPeriod)} ("${allowanceName || 'Einnahme'} gestaffelt") wurde hinzugefügt.`);
    } catch(e) {
      handleFirestoreError(e, OperationType.CREATE, `users/${user.uid}/transactions`);
    }
  };

  const addTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!descInput || !amountInput || !dateInput || !user) return;

    const newTx = {
      userId: user.uid,
      date: dateInput,
      description: descInput,
      amount: parseFloat(amountInput),
      type: typeInput,
      category: categoryInput,
      createdAt: serverTimestamp()
    };

    try {
      const id = await calculateTransactionHash(user.uid, newTx);
      await setDoc(doc(db, `users/${user.uid}/transactions/${id}`), newTx);
      setDescInput('');
      setAmountInput('');
    } catch(e) {
      handleFirestoreError(e, OperationType.CREATE, `users/${user.uid}/transactions`);
    }
  };

  const deleteTransaction = async (id: string) => {
    if(!user) return;
    try {
      await deleteDoc(doc(db, `users/${user.uid}/transactions/${id}`));
    } catch(e) {
      handleFirestoreError(e, OperationType.DELETE, `users/${user.uid}/transactions/${id}`);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !user) return;

    try {
      setIsUploading(true);
      let totalExtracted = 0;
      let skipped = 0;
      let latestOpeningBalance: number | null = null;
      let latestClosingBalance: number | null = null;
      let latestStatementMonth: string | null = null;
      const fileReports: { fileName: string; status: 'übertragen' | 'nicht übertragen' | 'nicht lesbar' | 'Fehler' }[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          // Add a small delay between requests to avoid burst rate limits (429)
          if (i > 0) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
          
          const result = await extractTransactionsFromImage(file);
          
          if (!result.isReadable) {
            fileReports.push({ fileName: file.name, status: 'nicht lesbar' });
            continue;
          }

          if (result.openingBalance !== null) latestOpeningBalance = result.openingBalance;
          if (result.closingBalance !== null) latestClosingBalance = result.closingBalance;
          if (result.statementMonth) latestStatementMonth = result.statementMonth;

          const extracted = result.transactions;
          if (extracted && extracted.length > 0) {
            let addedForThisFile = 0;
            for(const item of extracted) {
               const newTx = {
                 userId: user.uid,
                 date: item.date,
                 description: item.description,
                 amount: item.amount,
                 type: item.type as TransactionType,
                 category: item.category || 'Sonstiges',
                 reference: item.reference || '',
                 createdAt: serverTimestamp()
               };
               
               const id = await calculateTransactionHash(user.uid, newTx);
               
               const docRef = doc(db, `users/${user.uid}/transactions/${id}`);
               const snap = await getDoc(docRef);
               if (snap.exists()) {
                 skipped++;
                 continue;
               }
               
               await setDoc(docRef, newTx);
               totalExtracted++;
               addedForThisFile++;
            }
            if (addedForThisFile > 0 || extracted.length > 0) {
               // If there were transactions but all were skipped, we still call it "übertragen" (because they were found/processed), or "nicht übertragen"? Let's say "übertragen" if any were found.
               fileReports.push({ fileName: file.name, status: 'übertragen' });
            } else {
               fileReports.push({ fileName: file.name, status: 'nicht übertragen' });
            }
          } else {
             fileReports.push({ fileName: file.name, status: 'nicht übertragen' });
          }
        } catch (error) {
          console.error(`Fehler bei Datei ${file.name}:`, error);
          fileReports.push({ fileName: file.name, status: 'Fehler' });
        }
      }
      
      // Update opening balance if we found one
      if (latestOpeningBalance !== null && latestStatementMonth) {
         setOpeningBalances(prev => ({ ...prev, [latestStatementMonth]: latestOpeningBalance as number }));
         // Need to merge it into DB immediately so we don't depend on effect timeouts
         await setDoc(doc(db, `users/${user.uid}/settings/budget`), {
           openingBalances: { [latestStatementMonth]: latestOpeningBalance }
         }, { merge: true });
      }

      setUploadReport({
        show: true,
        totalExtracted,
        skipped,
        openingBalance: latestOpeningBalance,
        closingBalance: latestClosingBalance,
        statementMonth: latestStatementMonth,
        fileReports
      });
      
    } catch (error) {
      console.error(error);
      alert("Fehler beim Verarbeiten: " + (error as Error).message);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };


  // Date controls
  const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));

  const formatMonthYear = (d: Date) => {
    return d.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
  };

  const formatCurrency = (amount: number) => {
    return amount.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
  };

  const currentMonthTransactions = transactions.filter((tx) => {
    const txDate = new Date(tx.date);
    return txDate.getMonth() === currentDate.getMonth() && 
           txDate.getFullYear() === currentDate.getFullYear();
  });

  const totalIncome = currentMonthTransactions
    .filter(tx => tx.type === 'income')
    .reduce((sum, tx) => sum + tx.amount, 0);

  const totalExpense = currentMonthTransactions
    .filter(tx => tx.type === 'expense')
    .reduce((sum, tx) => sum + tx.amount, 0);

  const monthKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
  const openingBalanceForMonth = openingBalances[monthKey] || 0;
  
  const balance = openingBalanceForMonth + totalIncome - totalExpense;

  const updateOpeningBalance = (val: string) => {
    const num = parseFloat(val) || 0;
    setOpeningBalances(prev => ({ ...prev, [monthKey]: num }));
  };

  const budgetData = CATEGORIES.map(cat => {
    const spent = currentMonthTransactions
      .filter(tx => tx.type === 'expense' && tx.category === cat)
      .reduce((sum, tx) => sum + tx.amount, 0);
    const budget = budgets[cat] || 0;
    return {
      name: cat,
      Ausgaben: spent,
      Budget: budget,
    };
  }).filter(data => data.Ausgaben > 0 || data.Budget > 0);

  return (
    <div className="h-screen bg-zinc-950 text-zinc-100 font-sans flex flex-col overflow-hidden">
      {/* Header Navigation */}
      <header className="h-16 md:h-20 flex shrink-0 items-center justify-between px-4 md:px-8 border-b border-zinc-800/60 bg-zinc-900/30 backdrop-blur-md">
        <div className="flex items-center gap-3 md:gap-5">
          <div className="w-10 h-10 md:w-12 md:h-12 flex shrink-0 bg-emerald-500 rounded-xl items-center justify-center text-lg md:text-xl font-bold text-zinc-950">
            P
          </div>
          <span className="text-lg md:text-3xl font-semibold tracking-tight text-zinc-100 hidden sm:inline-block">
            Planner <span className="text-emerald-500">Niklas</span>
          </span>
          <span className="text-lg font-semibold tracking-tight text-zinc-100 sm:hidden">
            Planner <span className="text-emerald-500">Niklas</span>
          </span>
        </div>
        <div className="flex items-center gap-3 md:gap-6">
          <div className="flex items-center gap-1 md:gap-2 bg-zinc-800/50 px-2 md:px-3 py-1.5 rounded-full border border-zinc-700/50">
            <button 
              onClick={prevMonth}
              className="text-zinc-400 hover:text-white transition p-1"
              aria-label="Vorheriger Monat"
            >
              <ChevronLeft className="w-4 h-4 md:w-5 md:h-5" />
            </button>
            <span className="px-1 md:px-2 text-xs md:text-sm font-medium whitespace-nowrap">
              {formatMonthYear(currentDate)}
            </span>
            <button 
              onClick={nextMonth}
              className="text-zinc-400 hover:text-white transition p-1"
              aria-label="Nächster Monat"
            >
              <ChevronRight className="w-4 h-4 md:w-5 md:h-5" />
            </button>
          </div>
          <div className="h-6 md:h-8 w-[1px] bg-zinc-800 hidden md:block"></div>
          <button 
            onClick={signOut}
            className="p-2 hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-rose-400 transition"
            title="Abmelden"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden p-4 md:p-6 gap-4 md:gap-6 max-w-[1400px] w-full mx-auto">
        {/* Sidebar: Monthly Stats */}
        <aside className="w-full lg:w-80 flex flex-col gap-4 shrink-0 overflow-visible lg:overflow-y-auto lg:pr-2">
          <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800">
            <div className="flex justify-between items-center mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Saldo am Monatsende</span>
              <div className="flex items-center gap-2">
                 <span className="text-xs text-zinc-500">Anfang:</span>
                 <input 
                   type="number"
                   value={openingBalances[monthKey] || ''}
                   onChange={(e) => updateOpeningBalance(e.target.value)}
                   className="w-20 bg-transparent border-b border-zinc-700 text-right focus:border-emerald-500 focus:outline-none text-zinc-300 placeholder-zinc-700 p-0 text-xs"
                   placeholder="0.00"
                 />
              </div>
            </div>
            
            <h3 className={`text-3xl font-bold ${balance >= 0 ? 'text-white' : 'text-rose-400'}`}>
              {balance >= 0 ? '+ ' : ''}{formatCurrency(balance)}
            </h3>
            <div className="mt-4 flex flex-col gap-3">
              <div className="flex justify-between items-center text-sm">
                <span className="text-zinc-400">Anfangsbestand</span>
                <span className="text-zinc-100 font-medium">{formatCurrency(openingBalanceForMonth)}</span>
              </div>
              <div className="w-full h-px bg-zinc-800/60 my-1"></div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-zinc-400">Einnahmen</span>
                <span className="text-emerald-500 font-medium">+ {formatCurrency(totalIncome)}</span>
              </div>
              <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-emerald-500" 
                  style={{ width: totalIncome + totalExpense === 0 ? '0%' : `${(totalIncome / (totalIncome + totalExpense)) * 100}%` }}
                ></div>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-zinc-400">Ausgaben</span>
                <span className="text-rose-400 font-medium">- {formatCurrency(totalExpense)}</span>
              </div>
              <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-rose-500" 
                  style={{ width: totalIncome + totalExpense === 0 ? '0%' : `${(totalExpense / (totalIncome + totalExpense)) * 100}%` }}
                ></div>
              </div>
            </div>
          </div>

          <div className="flex-1 p-5 rounded-2xl bg-zinc-900 border border-zinc-800 flex flex-col min-h-[250px]">
            <h4 className="text-sm font-semibold mb-4 text-zinc-100 flex items-center justify-between">
              <span>Kategorien & Budgets</span>
            </h4>
            <div className="flex-1 overflow-y-auto pr-2 space-y-3">
               {CATEGORIES.map(cat => {
                 const spent = currentMonthTransactions
                   .filter(tx => tx.type === 'expense' && tx.category === cat)
                   .reduce((sum, tx) => sum + tx.amount, 0);
                 const budget = budgets[cat] || 0;
                 const percentage = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0;
                 
                 return (
                   <div key={cat} className="space-y-1">
                     <div className="flex justify-between items-center text-xs">
                       <span className="text-zinc-300 font-medium">{cat}</span>
                       <div className="flex items-center gap-2">
                         <span className={spent > budget && budget > 0 ? 'text-rose-400' : 'text-zinc-400'}>
                           {formatCurrency(spent)}
                         </span>
                         <span className="text-zinc-600">/</span>
                         <input
                           type="number"
                           className="w-16 bg-transparent border-b border-zinc-700 text-right focus:border-emerald-500 focus:outline-none text-zinc-300 placeholder-zinc-700 p-0 text-xs"
                           placeholder="Limit"
                           value={budgets[cat] || ''}
                           onChange={(e) => setBudgets(prev => ({ ...prev, [cat]: parseFloat(e.target.value) || 0 }))}
                         />
                       </div>
                     </div>
                     {budget > 0 && (
                       <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                         <div 
                           className={`h-full ${percentage > 100 ? 'bg-rose-500' : percentage > 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                           style={{ width: `${percentage}%` }}
                         ></div>
                       </div>
                     )}
                   </div>
                 );
               })}
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800 flex flex-col shrink-0">
            <h4 className="text-sm font-semibold mb-4 text-zinc-100 flex items-center justify-between">
              <span>Gestaffelte Einnahmen</span>
              <Wallet className="w-4 h-4 text-emerald-500" />
            </h4>
            
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] uppercase tracking-widest text-zinc-500 mb-1.5">Bezeichnung</label>
                <input 
                  type="text" 
                  value={allowanceName}
                  onChange={(e) => setAllowanceName(e.target.value)}
                  placeholder="z.B. Kindergeld" 
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 text-zinc-100 placeholder-zinc-600"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-widest text-zinc-500 mb-1.5">Gesamtbetrag (€)</label>
                <input 
                  type="number" 
                  value={totalAmount}
                  onChange={(e) => setTotalAmount(e.target.value)}
                  placeholder="z.B. 1200" 
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 text-zinc-100 placeholder-zinc-600"
                />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-[10px] uppercase tracking-widest text-zinc-500 mb-1.5">Aufteilung über</label>
                  <input 
                    type="number"
                    min="1"
                    value={installments}
                    onChange={(e) => setInstallments(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 text-zinc-100"
                  />
                </div>
                <div className="flex-[1.5]">
                  <label className="block text-[10px] uppercase tracking-widest text-zinc-500 mb-1.5">Einheit</label>
                  <select 
                    value={period}
                    onChange={(e) => setPeriod(e.target.value as 'weeks' | 'months')}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 text-zinc-100"
                  >
                    <option value="weeks">Wochen</option>
                    <option value="months">Monate</option>
                  </select>
                </div>
              </div>
              
              {totalNum > 0 && (
                <div className="pt-4 border-t border-zinc-800/60 mt-3">
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-xs text-zinc-400">Teilbetrag pro {period === 'weeks' ? 'Woche' : 'Monat'}:</span>
                    <span className="text-sm font-semibold text-emerald-500">{formatCurrency(perPeriod)}</span>
                  </div>
                  <p className="text-[10px] text-zinc-500 leading-relaxed mb-3">
                    Buchen Sie Ihre Tranche von "{allowanceName || 'Einnahme'}" jeweils per Klick.
                  </p>
                  <button 
                    onClick={addAllowanceTransaction}
                    className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 font-medium py-1.5 rounded-lg text-xs transition"
                  >
                    Einnahme jetzt eintragen
                  </button>
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Central Panel: Input & OCR */}
        <section className="flex-1 flex flex-col gap-4 md:gap-6 overflow-visible lg:overflow-hidden">
          {/* OCR Upload Area */}
          <div className="h-48 shrink-0 rounded-2xl border-2 border-dashed border-zinc-800 bg-zinc-900/50 flex flex-col items-center justify-center text-center p-6 transition hover:border-emerald-500 group relative">
            <div className="w-12 h-12 bg-zinc-800 rounded-full flex items-center justify-center mb-3 group-hover:bg-emerald-500/10 transition">
              {isUploading ? (
                 <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
              ) : (
                 <Upload className="w-6 h-6 text-zinc-500 group-hover:text-emerald-500 transition" />
              )}
            </div>
            <h4 className="text-sm font-medium">{isUploading ? 'Analysiere Daten...' : 'Kontoauszüge hochladen'}</h4>
            <p className="text-xs text-zinc-500 mt-1">Mehrere Dateien gleichzeitig wählbar (Bilder/PDFs)</p>
            <input 
              type="file" 
              accept="image/*,application/pdf"
              multiple
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
              ref={fileInputRef}
              onChange={handleFileUpload}
              disabled={isUploading}
            />
          </div>

          {/* Budget Progress Chart */}
          {budgetData.length > 0 && (
            <div className="p-6 shrink-0 rounded-2xl bg-zinc-900 border border-zinc-800">
              <h4 className="text-sm font-semibold mb-4 text-zinc-100">Budget vs. Ausgaben</h4>
              <div className="w-full h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={budgetData} layout="vertical" margin={{ top: 5, right: 20, left: 40, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={true} vertical={false} />
                    <XAxis type="number" stroke="#a1a1aa" fontSize={12} tickFormatter={(val) => `€${val}`} />
                    <YAxis dataKey="name" type="category" stroke="#a1a1aa" fontSize={12} width={120} tick={{ fill: '#a1a1aa' }} />
                    <Tooltip 
                      cursor={{ fill: '#27272a' }}
                      contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '8px' }}
                      itemStyle={{ fontSize: '13px' }}
                      labelStyle={{ color: '#a1a1aa', marginBottom: '4px', fontSize: '13px' }}
                      formatter={(value: number) => [formatCurrency(value), '']}
                    />
                    <Legend wrapperStyle={{ fontSize: '12px', color: '#a1a1aa' }} />
                    <Bar dataKey="Ausgaben" name="Ausgaben" fill="#f43f5e" radius={[0, 4, 4, 0]} barSize={16} />
                    <Bar dataKey="Budget" name="Budget" fill="#10b981" radius={[0, 4, 4, 0]} barSize={16} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Manual Entry Form */}
          <div className="p-6 shrink-0 rounded-2xl bg-zinc-900 border border-zinc-800">
            <h4 className="text-sm font-semibold mb-4">Manueller Eintrag</h4>
            <form onSubmit={addTransaction}>
              <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                <div className="md:col-span-2">
                  <label htmlFor="desc" className="block text-[10px] uppercase tracking-widest text-zinc-500 mb-1.5">Bezeichnung</label>
                  <input 
                    type="text" 
                    id="desc"
                    required
                    value={descInput}
                    onChange={(e) => setDescInput(e.target.value)}
                    placeholder="z.B. Wocheneinkauf" 
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 text-zinc-100 placeholder-zinc-600"
                  />
                </div>
                <div>
                  <label htmlFor="amount" className="block text-[10px] uppercase tracking-widest text-zinc-500 mb-1.5">Betrag (€)</label>
                  <input 
                    type="number" 
                    id="amount"
                    required
                    min="0"
                    step="0.01"
                    value={amountInput}
                    onChange={(e) => setAmountInput(e.target.value)}
                    placeholder="0.00" 
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 text-zinc-100 placeholder-zinc-600"
                  />
                </div>
                <div>
                  <label htmlFor="date" className="block text-[10px] uppercase tracking-widest text-zinc-500 mb-1.5">Datum</label>
                  <input 
                    type="date" 
                    id="date"
                    required
                    value={dateInput}
                    onChange={(e) => setDateInput(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 text-zinc-100 [&::-webkit-calendar-picker-indicator]:invert"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-widest text-zinc-500 mb-1.5">Typ</label>
                  <select 
                    value={typeInput}
                    onChange={(e) => setTypeInput(e.target.value as TransactionType)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 text-zinc-100"
                  >
                    <option value="expense">Ausgabe</option>
                    <option value="income">Einnahme</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-widest text-zinc-500 mb-1.5">Kategorie</label>
                  <select 
                    value={categoryInput}
                    onChange={(e) => setCategoryInput(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 text-zinc-100"
                  >
                    {CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              </div>
              <button 
                type="submit"
                className="mt-4 w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-2 rounded-lg text-sm transition"
              >
                Eintrag speichern
              </button>
            </form>
          </div>

          {/* Recent Transactions Table */}
          <div className="flex-1 p-6 rounded-2xl bg-zinc-900 border border-zinc-800 overflow-hidden flex flex-col">
            <h4 className="text-sm font-semibold mb-4">Letzte Aktivitäten</h4>
            
            {currentMonthTransactions.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-zinc-500">
                <Wallet className="w-10 h-10 mb-3 text-zinc-700" />
                <p className="text-sm">Keine Transaktionen in diesem Monat.</p>
              </div>
            ) : (
              <div className="flex-1 overflow-visible lg:overflow-y-auto pr-0 lg:pr-2 space-y-1">
                {currentMonthTransactions
                  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                  .map((tx) => (
                  <div key={tx.id} className="flex items-center p-3 hover:bg-zinc-800/50 rounded-xl transition group">
                    <div className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center mr-4 ${
                      tx.type === 'income' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'
                    }`}>
                      {tx.type === 'income' ? (
                         <TrendingUp className="w-5 h-5" />
                      ) : (
                         <TrendingDown className="w-5 h-5" />
                      )}
                    </div>
                    <div className="flex-1 overflow-hidden">
                       <p className="text-sm font-medium truncate">{tx.description}</p>
                      <p className="text-[11px] text-zinc-500 uppercase">
                        {new Date(tx.date).toLocaleDateString('de-DE')} • {tx.category || 'Sonstiges'}
                      </p>
                    </div>
                    <div className="flex flex-col md:flex-row items-end md:items-center gap-1 md:gap-4 shrink-0 pl-2">
                       <span className={`font-medium text-sm md:text-base ${
                         tx.type === 'income' ? 'text-emerald-500' : 'text-rose-400'
                       }`}>
                         {tx.type === 'income' ? '+' : '-'} {formatCurrency(tx.amount)}
                       </span>
                       <button
                         onClick={() => deleteTransaction(tx.id)}
                         className="text-zinc-600 hover:text-rose-500 opacity-100 md:opacity-0 group-hover:opacity-100 transition-all p-1"
                         title="Eintrag löschen"
                       >
                         <Trash2 className="w-4 h-4" />
                       </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Bottom Year Rail */}
      <footer className="h-16 shrink-0 bg-zinc-900 border-t border-zinc-800 flex items-center px-4 md:px-6">
        <div className="flex gap-1 w-full max-w-[1400px] mx-auto overflow-x-auto pb-1 md:pb-0 scrollbar-hide">
          {Array.from({ length: 12 }).map((_, i) => {
             const monthNames = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
             const isCurrent = currentDate.getMonth() === i;
             return (
               <button 
                 key={i}
                 onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), i, 1))}
                 className={`flex-1 min-w-[3rem] md:min-w-0 px-2 text-[10px] md:text-xs font-bold uppercase py-2 transition rounded-md ${
                   isCurrent 
                     ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' 
                     : 'text-zinc-600 hover:text-zinc-200 border border-transparent'
                 }`}
               >
                 {monthNames[i]}
               </button>
             );
          })}
        </div>
      </footer>

      {/* Upload Report Modal */}
      {uploadReport.show && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-700/50 rounded-2xl w-full max-w-md shadow-xl overflow-hidden flex flex-col">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-zinc-100 flex items-center gap-2 mb-2">
                <Upload className="w-5 h-5 text-emerald-500" />
                Upload-Bericht
              </h3>
              <p className="text-sm text-zinc-400 mb-6">Ergebnis der Auswertung Ihrer Kontoauszüge.</p>
              
              <div className="space-y-4">
                <div className="flex justify-between items-center bg-zinc-950 p-3 rounded-xl border border-zinc-800">
                  <span className="text-sm text-zinc-300">Neue Transaktionen erfasst</span>
                  <span className="text-emerald-500 font-semibold">{uploadReport.totalExtracted}</span>
                </div>
                
                {uploadReport.skipped > 0 && (
                  <div className="flex justify-between items-center bg-zinc-950 p-3 rounded-xl border border-zinc-800">
                     <span className="text-sm text-zinc-300">Duplikate (übersprungen)</span>
                     <span className="text-rose-400 font-semibold">{uploadReport.skipped}</span>
                  </div>
                )}
                
                {(uploadReport.openingBalance !== null || uploadReport.closingBalance !== null) && (
                  <div className="mt-4 border-t border-zinc-800 pt-4">
                    <h4 className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-3">Ausgelesene Salden</h4>
                    <div className="space-y-2">
                      {uploadReport.statementMonth && (
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-zinc-400">Auszugsmonat</span>
                          <span className="text-zinc-100">{uploadReport.statementMonth}</span>
                        </div>
                      )}
                      {uploadReport.openingBalance !== null && (
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-zinc-400">Anfangssaldo (Übernommen)</span>
                          <span className="text-zinc-100 font-medium">{formatCurrency(uploadReport.openingBalance)}</span>
                        </div>
                      )}
                      {uploadReport.closingBalance !== null && (
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-zinc-400">Endsaldo lt. Dokument</span>
                          <span className="text-zinc-100 font-medium">{formatCurrency(uploadReport.closingBalance)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                
                {/* Dateidetails */}
                {uploadReport.fileReports && uploadReport.fileReports.length > 0 && (
                  <div className="mt-4 border-t border-zinc-800 pt-4">
                    <h4 className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-3">Dateidetails</h4>
                    <ul className="space-y-2">
                      {uploadReport.fileReports.map((fr, idx) => (
                        <li key={idx} className="flex justify-between items-center text-sm bg-zinc-950 p-2 rounded-lg border border-zinc-800/60">
                          <span className="text-zinc-300 truncate max-w-[200px]" title={fr.fileName}>{fr.fileName}</span>
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            fr.status === 'übertragen' ? 'bg-emerald-500/20 text-emerald-400' :
                            fr.status === 'nicht lesbar' ? 'bg-orange-500/20 text-orange-400' :
                            fr.status === 'Fehler' ? 'bg-rose-500/20 text-rose-400' :
                            'bg-zinc-700 text-zinc-300'
                          }`}>
                            {fr.status}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
            <div className="p-4 bg-zinc-950 border-t border-zinc-800">
              <button 
                onClick={() => setUploadReport({ ...uploadReport, show: false })}
                className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-medium py-2 rounded-xl transition"
              >
                Schließen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

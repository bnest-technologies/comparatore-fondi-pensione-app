#!/usr/bin/env node
/*
  Generates app/frontend/data/funds.ts from the canonical compartments dataset:
  data/database_comparti_2026-09-20.csv
*/

const fs = require('fs');
const path = require('path');

const DATASET_FILE = 'database_comparti_2026-09-20.csv';
const CLOSED_FUNDS_FILE = 'fondi_chiusi_nuovi_aderenti.csv';
const COLLECTIVE_AGREEMENTS_FILE = 'fondi_accordi_collettivi.csv';
const EXPECTED_ROWS = 489;

// Corrections verified against the provider documentation. They are kept here because
// the source CSV is an ignored local import and would otherwise overwrite them.
const CAPITAL_GUARANTEE_OVERRIDES = new Set([
  '5047|BCC VITA EQUITY AMERICA PIP',
  '5047|BCC VITA EQUITY EUROPA PIP',
  '5047|BCC VITA EQUITY ASIA PIP',
]);

const COST_DETAIL_OVERRIDES = new Map([
  [
    'FPN|126|COMPARTO AZIONARIO',
    {
      annuiGestione: '0,12% del patrimonio su base annua; 0,03% per commissioni depositario; 0,02% per commissioni amministrative',
      gestioneFinanziaria: '10% dell’extra rendimento, se positivo, realizzato nei confronti del benchmark di riferimento alla scadenza della convenzione (su base triennale)',
    },
  ],
]);

const CATEGORY_MAP = {
  Garantito: 'GAR',
  Bilanciato: 'BIL',
  Azionario: 'AZN',
  'Obbligazionario Misto': 'OBB MISTO',
  'Obbligazionario Puro': 'OBB PURO',
  Obbligazionario: 'OBB',
};

const REQUIRED_COLUMNS = [
  'tipo',
  'N. Albo',
  'Categoria',
  'Fondo Pensione',
  'Società',
  'Linea/Comparto',
  'Classificazione Covip',
  'Performance 1Y',
  'Performance 3Y',
  'Performance 5Y',
  'Performance 10Y',
  'Performance 20Y',
  'ISC 2 Anni',
  'ISC 5 Anni',
  'ISC 10 Anni',
  'ISC 35 Anni',
  'rating',
];

const CLOSED_FUNDS_COLUMNS = [
  'tipo',
  'N. Albo',
  'Linea/Comparto',
  'Chiuso ai nuovi aderenti',
];

const COLLECTIVE_AGREEMENT_COLUMNS = [
  'tipo',
  'N. Albo',
  'Linea/Comparto',
  'Accordi collettivi',
  'Etichetta accordi',
  'Costo sottoscrizione individuale',
  'Costo sottoscrizione collettiva',
  'Commissione gestione collettiva',
  'Provvigione incentivo',
  'Note',
  'Fonte',
];

function detectDelimiter(firstLine) {
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  return semicolonCount > commaCount ? ';' : ',';
}

function parseCsvLine(line, delimiter) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}

function parseCsv(content) {
  const cleanContent = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
  const lines = cleanContent.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    throw new Error('CSV vuoto');
  }

  const delimiter = detectDelimiter(lines[0]);
  const headers = parseCsvLine(lines[0], delimiter).map((header) => header.trim());
  const rows = lines.slice(1).map((line, lineIndex) => {
    const values = parseCsvLine(line, delimiter);
    if (values.length !== headers.length) {
      throw new Error(`Riga ${lineIndex + 2}: colonne attese ${headers.length}, trovate ${values.length}`);
    }
    return Object.fromEntries(headers.map((header, index) => [header, (values[index] || '').trim()]));
  });

  return { headers, rows };
}

function decimalOrEmpty(value) {
  if (!value) return '';
  return value.replace(',', '.').trim();
}

function normalizeWebsite(value) {
  if (!value) return '';
  return value.trim();
}

function normalizeDate(value) {
  if (!value) return '';
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return value;
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

function yesNoToBooleanString(value) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return '';
  if (['si', 'sì', 'yes', 'true'].includes(normalized)) return 'true';
  if (['no', 'false'].includes(normalized)) return 'false';
  return '';
}

function json(value) {
  return JSON.stringify(value);
}

function fundKey(type, nAlbo, comparto) {
  return `${type}|${nAlbo}|${comparto}`;
}

function fundKeyFromRow(row) {
  return fundKey(row.tipo, row['N. Albo'], row['Linea/Comparto']);
}

function readOptionalCsv(fileName) {
  const filePath = path.join(__dirname, '..', 'data', fileName);
  if (!fs.existsSync(filePath)) {
    return { headers: [], rows: [] };
  }

  return parseCsv(fs.readFileSync(filePath, 'utf8'));
}

function validateSidecarHeaders(fileName, headers, requiredColumns) {
  const missingColumns = requiredColumns.filter((column) => !headers.includes(column));
  if (missingColumns.length > 0) {
    throw new Error(`${fileName}: colonne mancanti: ${missingColumns.join(', ')}`);
  }
}

function buildClosedFundsMap() {
  const { headers, rows } = readOptionalCsv(CLOSED_FUNDS_FILE);
  if (rows.length === 0) {
    return new Map();
  }

  validateSidecarHeaders(CLOSED_FUNDS_FILE, headers, CLOSED_FUNDS_COLUMNS);
  const map = new Map();
  rows.forEach((row, index) => {
    const key = fundKeyFromRow(row);
    if (!row.tipo || !row['N. Albo'] || !row['Linea/Comparto']) {
      throw new Error(`${CLOSED_FUNDS_FILE}: riga ${index + 2} con chiave incompleta`);
    }
    if (map.has(key)) {
      throw new Error(`${CLOSED_FUNDS_FILE}: chiave duplicata ${key}`);
    }
    map.set(key, yesNoToBooleanString(row['Chiuso ai nuovi aderenti']) === 'true');
  });
  return map;
}

function buildCollectiveAgreementMap() {
  const { headers, rows } = readOptionalCsv(COLLECTIVE_AGREEMENTS_FILE);
  if (rows.length === 0) {
    return new Map();
  }

  validateSidecarHeaders(COLLECTIVE_AGREEMENTS_FILE, headers, COLLECTIVE_AGREEMENT_COLUMNS);
  const map = new Map();
  rows.forEach((row, index) => {
    const key = fundKeyFromRow(row);
    if (!row.tipo || !row['N. Albo'] || !row['Linea/Comparto']) {
      throw new Error(`${COLLECTIVE_AGREEMENTS_FILE}: riga ${index + 2} con chiave incompleta`);
    }
    if (map.has(key)) {
      throw new Error(`${COLLECTIVE_AGREEMENTS_FILE}: chiave duplicata ${key}`);
    }
    map.set(key, {
      hasCollectiveAgreements: yesNoToBooleanString(row['Accordi collettivi']) === 'true',
      collectiveAgreementLabel: row['Etichetta accordi'] || '',
      subscriptionCostIndividual: row['Costo sottoscrizione individuale'] || '',
      subscriptionCostCollective: row['Costo sottoscrizione collettiva'] || '',
      collectiveManagementFee: row['Commissione gestione collettiva'] || '',
      incentiveFee: row['Provvigione incentivo'] || '',
      notes: row.Note || '',
      sourceFileName: row.Fonte || '',
    });
  });
  return map;
}

function validateRows(headers, rows) {
  const missingColumns = REQUIRED_COLUMNS.filter((column) => !headers.includes(column));
  if (missingColumns.length > 0) {
    throw new Error(`Colonne mancanti: ${missingColumns.join(', ')}`);
  }

  if (rows.length !== EXPECTED_ROWS) {
    throw new Error(`Righe dataset attese ${EXPECTED_ROWS}, trovate ${rows.length}`);
  }

  const seenKeys = new Set();
  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const category = row['Classificazione Covip'];
    if (!CATEGORY_MAP[category]) {
      throw new Error(`Riga ${rowNumber}: classificazione COVIP non mappata "${category}"`);
    }

    const key = fundKeyFromRow(row);
    if (seenKeys.has(key)) {
      throw new Error(`Riga ${rowNumber}: chiave duplicata ${key}`);
    }
    seenKeys.add(key);

    ['tipo', 'N. Albo', 'Fondo Pensione', 'Linea/Comparto'].forEach((column) => {
      if (!row[column]) {
        throw new Error(`Riga ${rowNumber}: campo obbligatorio vuoto "${column}"`);
      }
    });
  });
}

function toGeneratedRow(row, closedFundsMap, collectiveAgreementMap) {
  const fundKey = `${row['N. Albo']}|${row['Linea/Comparto']}`;
  const guarantee = CAPITAL_GUARANTEE_OVERRIDES.has(fundKey)
    ? 'false'
    : yesNoToBooleanString(row.Garanzia);
  const sidecarKey = fundKeyFromRow(row);
  const costOverride = COST_DETAIL_OVERRIDES.get(sidecarKey);
  const collectiveAgreement = collectiveAgreementMap.get(sidecarKey) ?? {
    hasCollectiveAgreements: false,
    collectiveAgreementLabel: '',
    subscriptionCostIndividual: '',
    subscriptionCostCollective: '',
    collectiveManagementFee: '',
    incentiveFee: '',
    notes: '',
    sourceFileName: '',
  };

  return [
    row.tipo,
    row['N. Albo'],
    row['Fondo Pensione'],
    row['Società'],
    row['Linea/Comparto'],
    CATEGORY_MAP[row['Classificazione Covip']],
    decimalOrEmpty(row['Performance 1Y']),
    decimalOrEmpty(row['Performance 3Y']),
    decimalOrEmpty(row['Performance 5Y']),
    decimalOrEmpty(row['Performance 10Y']),
    decimalOrEmpty(row['Performance 20Y']),
    decimalOrEmpty(row['ISC 2 Anni']),
    decimalOrEmpty(row['ISC 5 Anni']),
    decimalOrEmpty(row['ISC 10 Anni']),
    decimalOrEmpty(row['ISC 35 Anni']),
    row['Categoria/Contratto di Riferimento'],
    normalizeWebsite(row['Sito Web']),
    row.Categoria,
    row['Classificazione Covip'],
    guarantee,
    row['Costi di Adesione'],
    costOverride?.annuiGestione ?? row['Costi annui di Gestione'],
    costOverride?.gestioneFinanziaria ?? row['Costi di Gestione Finanziaria'],
    row['Costi di Anticipazione'],
    row['Costi di Trasferimento'],
    row['Costi di Riscatto'],
    row['Costi di Riallocazione della Posizione'],
    row['Costi di Riallocazione del Flusso Contributivo'],
    row['Costi di Erogazione'],
    row.Benchmark,
    row['Composizione Patrimonio: Azionario'],
    row['Composizione Patrimonio: Obbligazionario'],
    normalizeDate(row['Data inizio quotazione']),
    row.Sostenibilità,
    row.rating,
    closedFundsMap.get(sidecarKey) === true ? 'true' : 'false',
    collectiveAgreement.hasCollectiveAgreements ? 'true' : 'false',
    collectiveAgreement.collectiveAgreementLabel,
    collectiveAgreement.subscriptionCostIndividual,
    collectiveAgreement.subscriptionCostCollective,
    collectiveAgreement.collectiveManagementFee,
    collectiveAgreement.incentiveFee,
    collectiveAgreement.notes,
    collectiveAgreement.sourceFileName,
  ];
}

function buildTsContent(rows) {
  const tsLines = [
    `import { PensionFund, FundCategory, FundType, SourceRating } from '../types';`,
    `import { getFundInformativeNote } from './fundInformativeNotes';`,
    `import { calculateFundRating } from '../utils/fundRating';`,
    ``,
    `const parseFloatOrNull = (val: string): number | null => {`,
    `  if (val === null || val.trim() === '') return null;`,
    `  const num = parseFloat(val.replace(',', '.'));`,
    `  return isNaN(num) ? null : num;`,
    `};`,
    ``,
    `const parseBooleanOrNull = (val: string): boolean | null => {`,
    `  if (val === 'true') return true;`,
    `  if (val === 'false') return false;`,
    `  return null;`,
    `};`,
    ``,
    `const parseSourceRating = (val: string): SourceRating | null => {`,
    `  const num = Number.parseInt(val, 10);`,
    `  return num >= 1 && num <= 5 ? (num as SourceRating) : null;`,
    `};`,
    ``,
    `const emptyToNull = (val: string): string | null => val.trim() ? val : null;`,
    ``,
    `const buildCollectiveAgreementInfo = (`,
    `  hasCollectiveAgreements: string,`,
    `  collectiveAgreementLabel: string,`,
    `  subscriptionCostIndividual: string,`,
    `  subscriptionCostCollective: string,`,
    `  collectiveManagementFee: string,`,
    `  incentiveFee: string,`,
    `  notes: string,`,
    `  sourceFileName: string`,
    `): PensionFund['collectiveAgreementInfo'] => {`,
    `  const hasContent = hasCollectiveAgreements === 'true' || [`,
    `    collectiveAgreementLabel,`,
    `    subscriptionCostIndividual,`,
    `    subscriptionCostCollective,`,
    `    collectiveManagementFee,`,
    `    incentiveFee,`,
    `    notes,`,
    `    sourceFileName,`,
    `  ].some((value) => value.trim().length > 0);`,
    `  if (!hasContent) return null;`,
    ``,
    `  return {`,
    `    hasCollectiveAgreements: hasCollectiveAgreements === 'true',`,
    `    collectiveAgreementLabel: emptyToNull(collectiveAgreementLabel),`,
    `    subscriptionCostIndividual: emptyToNull(subscriptionCostIndividual),`,
    `    subscriptionCostCollective: emptyToNull(subscriptionCostCollective),`,
    `    collectiveManagementFee: emptyToNull(collectiveManagementFee),`,
    `    incentiveFee: emptyToNull(incentiveFee),`,
    `    notes: emptyToNull(notes),`,
    `    sourceFileName: emptyToNull(sourceFileName),`,
    `  };`,
    `};`,
    ``,
    `const generateId = (type: string, albo: string, comparto: string): string => {`,
    `  const sanitizedComparto = String(comparto || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');`,
    `  return \`\${type.toLowerCase()}-\${albo}-\${sanitizedComparto}\`;`,
    `};`,
    ``,
    `const allRows: string[][] = [`,
  ];

  rows.forEach((row) => {
    tsLines.push(`${json(row)},`);
  });

  tsLines.push(`];`);
  tsLines.push(``);
  tsLines.push(`export const pensionFundsData: PensionFund[] = allRows.map((row): PensionFund => {`);
  tsLines.push(`  const [`);
  tsLines.push(`    type, nAlbo, fondo, societa, comparto, categoria,`);
  tsLines.push(`    ultimoAnno, ultimi3Anni, ultimi5Anni, ultimi10Anni, ultimi20Anni,`);
  tsLines.push(`    isc2a, isc5a, isc10a, isc35a, categoriaContratto, sitoWeb,`);
  tsLines.push(`    categoriaEstesa, classificazioneCovip, garanzia, costoAdesione, costoAnnuoGestione,`);
  tsLines.push(`    costoGestioneFinanziaria, costoAnticipazione, costoTrasferimento, costoRiscatto,`);
  tsLines.push(`    costoRiallocazionePosizione, costoRiallocazioneFlusso, costoErogazione, benchmark,`);
  tsLines.push(`    azionario, obbligazionario, dataInizioQuotazione, sostenibilita, sourceRating,`);
  tsLines.push(`    chiusoNuoviAderenti, hasCollectiveAgreements, collectiveAgreementLabel,`);
  tsLines.push(`    subscriptionCostIndividual, subscriptionCostCollective, collectiveManagementFee, incentiveFee,`);
  tsLines.push(`    collectiveAgreementNotes, collectiveAgreementSource`);
  tsLines.push(`  ] = row;`);
  tsLines.push(``);
  tsLines.push(`  const isc5aValue = parseFloatOrNull(isc5a);`);
  tsLines.push(`  const fundWithoutRating: Omit<PensionFund, 'rating'> = {`);
  tsLines.push(`    id: generateId(type, nAlbo, comparto),`);
  tsLines.push(`    type: type as FundType,`);
  tsLines.push(`    societa: emptyToNull(societa),`);
  tsLines.push(`    pip: fondo,`);
  tsLines.push(`    nAlbo: Number.parseInt(nAlbo, 10),`);
  tsLines.push(`    linea: comparto,`);
  tsLines.push(`    ramo: null,`);
  tsLines.push(`    categoria: categoria as FundCategory,`);
  tsLines.push(`    categoriaEstesa: emptyToNull(categoriaEstesa),`);
  tsLines.push(`    classificazioneCovip: emptyToNull(classificazioneCovip),`);
  tsLines.push(`    garanzia: parseBooleanOrNull(garanzia),`);
  tsLines.push(`    isc: {`);
  tsLines.push(`      isc2a: parseFloatOrNull(isc2a),`);
  tsLines.push(`      isc5a: isc5aValue,`);
  tsLines.push(`      isc10a: parseFloatOrNull(isc10a),`);
  tsLines.push(`      isc35a: parseFloatOrNull(isc35a),`);
  tsLines.push(`    },`);
  tsLines.push(`    costoAnnuo: isc5aValue,`);
  tsLines.push(`    rendimenti: {`);
  tsLines.push(`      ultimoAnno: parseFloatOrNull(ultimoAnno),`);
  tsLines.push(`      ultimi3Anni: parseFloatOrNull(ultimi3Anni),`);
  tsLines.push(`      ultimi5Anni: parseFloatOrNull(ultimi5Anni),`);
  tsLines.push(`      ultimi10Anni: parseFloatOrNull(ultimi10Anni),`);
  tsLines.push(`      ultimi20Anni: parseFloatOrNull(ultimi20Anni),`);
  tsLines.push(`    },`);
  tsLines.push(`    categoriaContratto: emptyToNull(categoriaContratto),`);
  tsLines.push(`    sitoWeb: emptyToNull(sitoWeb),`);
  tsLines.push(`    notaInformativa: getFundInformativeNote(type as FundType, Number.parseInt(nAlbo, 10)),`);
  tsLines.push(`    costiDettaglio: {`);
  tsLines.push(`      adesione: emptyToNull(costoAdesione),`);
  tsLines.push(`      annuiGestione: emptyToNull(costoAnnuoGestione),`);
  tsLines.push(`      gestioneFinanziaria: emptyToNull(costoGestioneFinanziaria),`);
  tsLines.push(`      anticipazione: emptyToNull(costoAnticipazione),`);
  tsLines.push(`      trasferimento: emptyToNull(costoTrasferimento),`);
  tsLines.push(`      riscatto: emptyToNull(costoRiscatto),`);
  tsLines.push(`      riallocazionePosizione: emptyToNull(costoRiallocazionePosizione),`);
  tsLines.push(`      riallocazioneFlussoContributivo: emptyToNull(costoRiallocazioneFlusso),`);
  tsLines.push(`      erogazione: emptyToNull(costoErogazione),`);
  tsLines.push(`    },`);
  tsLines.push(`    benchmark: emptyToNull(benchmark),`);
  tsLines.push(`    assetAllocation: {`);
  tsLines.push(`      azionario: emptyToNull(azionario),`);
  tsLines.push(`      obbligazionario: emptyToNull(obbligazionario),`);
  tsLines.push(`    },`);
  tsLines.push(`    dataInizioQuotazione: emptyToNull(dataInizioQuotazione),`);
  tsLines.push(`    sostenibilita: emptyToNull(sostenibilita),`);
  tsLines.push(`    sourceRating: parseSourceRating(sourceRating),`);
  tsLines.push(`    chiusoNuoviAderenti: chiusoNuoviAderenti === 'true',`);
  tsLines.push(`    collectiveAgreementInfo: buildCollectiveAgreementInfo(`);
  tsLines.push(`      hasCollectiveAgreements,`);
  tsLines.push(`      collectiveAgreementLabel,`);
  tsLines.push(`      subscriptionCostIndividual,`);
  tsLines.push(`      subscriptionCostCollective,`);
  tsLines.push(`      collectiveManagementFee,`);
  tsLines.push(`      incentiveFee,`);
  tsLines.push(`      collectiveAgreementNotes,`);
  tsLines.push(`      collectiveAgreementSource`);
  tsLines.push(`    ),`);
  tsLines.push(`  };`);
  tsLines.push(``);
  tsLines.push(`  return { ...fundWithoutRating, rating: calculateFundRating(fundWithoutRating) };`);
  tsLines.push(`});`);

  return `${tsLines.join('\n')}\n`;
}

function main() {
  const datasetPath = path.join(__dirname, '..', 'data', DATASET_FILE);
  const outputPath = path.join(__dirname, '..', 'app', 'frontend', 'data', 'funds.ts');
  const content = fs.readFileSync(datasetPath, 'utf8');
  const { headers, rows } = parseCsv(content);
  const closedFundsMap = buildClosedFundsMap();
  const collectiveAgreementMap = buildCollectiveAgreementMap();

  validateRows(headers, rows);

  const generatedRows = rows.map((row) => toGeneratedRow(row, closedFundsMap, collectiveAgreementMap));
  const tsContent = buildTsContent(generatedRows);

  fs.writeFileSync(outputPath, tsContent, 'utf8');
  console.log(`Generated ${outputPath} with ${generatedRows.length} rows from ${DATASET_FILE}.`);
}

main();

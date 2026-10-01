/**
 * Crescita reale del salario scelta nel simulatore, condivisa da tutti i passaggi.
 * I calcoli del montante, del risparmio fiscale e del TFR la usano per far crescere i versamenti.
 */
import { createContext, useContext } from 'react';
import { CRESCITA_SALARIO_PREDEFINITA } from '../../utils/simulatorCalc';

interface ScenarioSalario {
  crescita: number;
  impostaCrescita: (v: number) => void;
}

export const CrescitaSalarioContext = createContext<ScenarioSalario>({
  crescita: CRESCITA_SALARIO_PREDEFINITA,
  impostaCrescita: () => {},
});

export const useCrescitaSalario = () => useContext(CrescitaSalarioContext).crescita;
export const useImpostaCrescitaSalario = () => useContext(CrescitaSalarioContext).impostaCrescita;

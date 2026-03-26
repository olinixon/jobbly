interface CommissionInput {
  contractorRate: number
  markupPercentage: number
  commissionPercentage: number
}

interface CommissionFromPriceInput {
  customerPrice: number
  markupPercentage: number
  commissionPercentage: number
}

interface CommissionResult {
  customerPrice: number
  contractorRate: number
  grossMarkup: number
  omnisideCommission: number
  clientMargin: number
}

export function calculateCommission(input: CommissionInput): CommissionResult {
  const { contractorRate, markupPercentage, commissionPercentage } = input
  const customerPrice = contractorRate * (1 + markupPercentage / 100)
  const grossMarkup = customerPrice - contractorRate
  const omnisideCommission = grossMarkup * (commissionPercentage / 100)
  const clientMargin = grossMarkup - omnisideCommission
  return {
    customerPrice: Math.round(customerPrice * 100) / 100,
    contractorRate: Math.round(contractorRate * 100) / 100,
    grossMarkup: Math.round(grossMarkup * 100) / 100,
    omnisideCommission: Math.round(omnisideCommission * 100) / 100,
    clientMargin: Math.round(clientMargin * 100) / 100,
  }
}

export function calculateCommissionFromCustomerPrice(input: CommissionFromPriceInput): CommissionResult {
  const { customerPrice, markupPercentage, commissionPercentage } = input
  const contractorRate = customerPrice / (1 + markupPercentage / 100)
  const grossMarkup = customerPrice - contractorRate
  const omnisideCommission = grossMarkup * (commissionPercentage / 100)
  const clientMargin = grossMarkup - omnisideCommission
  return {
    customerPrice: Math.round(customerPrice * 100) / 100,
    contractorRate: Math.round(contractorRate * 100) / 100,
    grossMarkup: Math.round(grossMarkup * 100) / 100,
    omnisideCommission: Math.round(omnisideCommission * 100) / 100,
    clientMargin: Math.round(clientMargin * 100) / 100,
  }
}

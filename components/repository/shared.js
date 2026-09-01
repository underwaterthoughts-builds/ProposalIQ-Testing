const OUTCOMES = ['won','lost','pending','active','withdrawn'];
const DEFAULT_SECTORS = ['Government & Public Sector','Healthcare & NHS','Aerospace & Defence','Financial Services','Technology','Retail & Consumer','Other'];
const DEFAULT_TYPES = ['Digital Transformation','Data & Analytics','Cloud Migration','Infrastructure','Software Development','Consultancy','Managed Services','Other'];
const DEFAULT_CURRENCIES = ['GBP','USD','EUR','AUD','CAD','CHF','JPY','SGD','AED'];
const AI_WEIGHT_DESC = { 1:'5% — loss analysis only', 2:'15% — negative example', 3:'40% — moderate influence', 4:'75% — high influence', 5:'100% — gold standard' };

export { OUTCOMES, DEFAULT_SECTORS, DEFAULT_TYPES, DEFAULT_CURRENCIES, AI_WEIGHT_DESC };

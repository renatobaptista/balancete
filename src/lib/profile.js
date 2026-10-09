// Informações pessoais ficam no perfil (user_metadata) do usuário no Supabase Auth.
// Só estas chaves são lidas/escritas aqui; outras (ex.: default_account) não são tocadas.

export const SEX_OPTIONS = [
  { value: "feminino", label: "Feminino" },
  { value: "masculino", label: "Masculino" },
  { value: "outro", label: "Outro" },
  { value: "nao_informar", label: "Prefiro não informar" },
];

const FIELD_TO_KEY = {
  name: "name",
  phone: "phone",
  birthDate: "birth_date",
  sex: "sex",
  country: "country",
  state: "state",
  city: "city",
};

export function profileFromMetadata(meta) {
  const m = meta || {};
  const out = {};
  for (const [field, key] of Object.entries(FIELD_TO_KEY)) out[field] = typeof m[key] === "string" ? m[key] : "";
  return out;
}

export function profileToMetadata(profile) {
  const out = {};
  for (const [field, key] of Object.entries(FIELD_TO_KEY)) out[key] = String(profile[field] ?? "").trim();
  return out;
}

export function validatePasswordChange(password, confirmation) {
  if (password.length < 6) return "A senha precisa ter pelo menos 6 caracteres.";
  if (password !== confirmation) return "As duas senhas precisam ser iguais.";
  return "";
}

export function validateEmailChange(newEmail, currentEmail) {
  const email = newEmail.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Digite um e-mail válido.";
  if (email.toLowerCase() === (currentEmail || "").toLowerCase()) return "Esse já é o seu e-mail atual.";
  return "";
}

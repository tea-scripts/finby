export interface AccountView {
  id: string;
  name: string;
  currency: string;
  accountType: string;
  balance: string;
  color: string | null;
  icon: string | null;
  isArchived: boolean;
}

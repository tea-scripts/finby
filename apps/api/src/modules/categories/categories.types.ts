export interface CategoryView {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  isDefault: boolean;
  isArchived: boolean;
}

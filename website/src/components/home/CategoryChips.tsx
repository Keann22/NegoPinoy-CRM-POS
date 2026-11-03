import React from 'react';
import { Tag, Sparkles } from 'lucide-react';

interface CategoryChipsProps {
  categories: string[];
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
  categoryCounts: Record<string, number>;
  totalCount: number;
  saleCount: number;
}

export const CategoryChips: React.FC<CategoryChipsProps> = ({
  categories,
  selectedCategory,
  onSelectCategory,
  categoryCounts,
  totalCount,
  saleCount,
}) => {
  return (
    <div className="category-chips-wrapper">
      <div className="category-chips-scroll">
        {/* All Products Chip */}
        <button
          type="button"
          onClick={() => onSelectCategory('all')}
          className={`category-chip ${selectedCategory === 'all' ? 'active' : ''}`}
        >
          <Sparkles size={15} />
          <span>Lahat ng Produkto</span>
          <span className="chip-count">{totalCount}</span>
        </button>

        {/* Sale Items Chip */}
        {saleCount > 0 && (
          <button
            type="button"
            onClick={() => onSelectCategory('sale')}
            className={`category-chip chip-sale ${selectedCategory === 'sale' ? 'active' : ''}`}
          >
            <Tag size={15} />
            <span>Naka-Sale 🔥</span>
            <span className="chip-count sale-count">{saleCount}</span>
          </button>
        )}

        {/* Dynamic Categories */}
        {categories.map((category) => {
          const count = categoryCounts[category] || 0;
          const isSelected = selectedCategory === category;

          return (
            <button
              key={category}
              type="button"
              onClick={() => onSelectCategory(category)}
              className={`category-chip ${isSelected ? 'active' : ''}`}
            >
              <span>{category}</span>
              <span className="chip-count">{count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

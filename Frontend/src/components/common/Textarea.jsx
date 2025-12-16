const Textarea = ({ 
  value, 
  onChange, 
  placeholder, 
  className = '',
  rows = 3,
  disabled = false,
  name
}) => {
  return (
    <textarea
      name={name}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      rows={rows}
      className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed transition-colors resize-none ${className}`}
    />
  );
};

export default Textarea;

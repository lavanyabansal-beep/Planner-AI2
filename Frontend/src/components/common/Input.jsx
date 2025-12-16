const Input = ({ 
  type = 'text', 
  value, 
  onChange, 
  placeholder, 
  className = '',
  disabled = false,
  required = false,
  name
}) => {
  return (
    <input
      type={type}
      name={name}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      required={required}
      className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed transition-colors ${className}`}
    />
  );
};

export default Input;

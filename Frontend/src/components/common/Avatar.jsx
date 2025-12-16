import { getInitials } from '../../utils/helpers';

const Avatar = ({ user, size = 'md', className = '' }) => {
  const sizes = {
    sm: 'w-6 h-6 text-xs',
    md: 'w-8 h-8 text-sm',
    lg: 'w-10 h-10 text-base',
    xl: 'w-12 h-12 text-lg',
  };
  
  const bgColor = user?.avatarColor || 'bg-primary-500';
  const initials = user ? getInitials(user.name) : '??';
  
  return (
    <div 
      className={`${sizes[size]} ${bgColor} rounded-full flex items-center justify-center text-white font-semibold ${className}`}
      title={user?.name}
    >
      {initials}
    </div>
  );
};

export default Avatar;

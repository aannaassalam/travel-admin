import { InputProps } from "react-html-props";

const VisuallyHiddenInput = (props: InputProps) => {
  return (
    <input
      className="h-px overflow-hidden absolute bottom-0 left-0 whitespace-nowrap w-[1] [clip:rect(0 0 0 0)] [clip-path:inset(50%)]"
      {...props}
    />
  );
};

export default VisuallyHiddenInput;

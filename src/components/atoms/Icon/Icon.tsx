import classNames from 'classnames';

import styles from './Icon.module.scss';

import Arrow from '@/assets/svg/arrow.svg';
import ArrowDown from '@/assets/svg/arrow-down.svg';
import ArrowSmall from '@/assets/svg/arrow-small.svg';
import ArrowUpRight from '@/assets/svg/arrow-up-right.svg';
import Ask from '@/assets/svg/ask.svg';
import Bulb from '@/assets/svg/bulb.svg';
import ChartBar from '@/assets/svg/chart-bar.svg';
import ChartLine from '@/assets/svg/chart-line.svg';
import ChartTable from '@/assets/svg/chart-table.svg';
import Check from '@/assets/svg/check.svg';
import ChevronDown from '@/assets/svg/chevron-down.svg';
import Closer from '@/assets/svg/closer.svg';
import Collapse from '@/assets/svg/collapse.svg';
import Copy from '@/assets/svg/copy.svg';
import CopySmall from '@/assets/svg/copy-small.svg';
import Download from '@/assets/svg/download.svg';
import Edit from '@/assets/svg/edit.svg';
import EditTitle from '@/assets/svg/edit-title.svg';
import Embed from '@/assets/svg/embed.svg';
import Feedback from '@/assets/svg/feedback.svg';
import Info from '@/assets/svg/info.svg';
import Kebab from '@/assets/svg/kebab.svg';
import Lock from '@/assets/svg/lock.svg';
import Menu from '@/assets/svg/menu.svg';
import Note from '@/assets/svg/note.svg';
import NoteRemove from '@/assets/svg/note-remove.svg';
import Pin from '@/assets/svg/pin.svg';
import Remove from '@/assets/svg/remove.svg';
import Reorder from '@/assets/svg/reorder.svg';
import Search from '@/assets/svg/search.svg';
import Share from '@/assets/svg/share.svg';
import Thumb from '@/assets/svg/thumb.svg';
import User from '@/assets/svg/user.svg';

export type IconProps = {
    name: keyof typeof icons;
    className?: string;
};

export const icons = {
    arrow: Arrow,
    'arrow-down': ArrowDown,
    'arrow-small': ArrowSmall,
    'arrow-up-right': ArrowUpRight,
    ask: Ask,
    bulb: Bulb,
    'chart-bar': ChartBar,
    'chart-line': ChartLine,
    'chart-table': ChartTable,
    check: Check,
    'chevron-down': ChevronDown,
    closer: Closer,
    collapse: Collapse,
    copy: Copy,
    'copy-small': CopySmall,
    download: Download,
    edit: Edit,
    'edit-title': EditTitle,
    embed: Embed,
    feedback: Feedback,
    info: Info,
    kebab: Kebab,
    lock: Lock,
    menu: Menu,
    note: Note,
    'note-remove': NoteRemove,
    pin: Pin,
    remove: Remove,
    reorder: Reorder,
    search: Search,
    share: Share,
    thumb: Thumb,
    user: User,
};

const Icon = ({ name, className }: IconProps) => {
    const Icon = icons[name];

    return <Icon className={classNames(styles[name], className)} />;
};

export default Icon;

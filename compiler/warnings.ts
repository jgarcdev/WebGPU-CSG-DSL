export type Warning = { message: string; line: number; column: number };

export class Warnings {
	private list: Warning[] = [];

	add(message: string, line = 0, column = 0) {
		this.list.push({ message, line, column });
	}

	all() {
		return this.list.slice();
	}

	isEmpty() {
		return this.list.length === 0;
	}
}

export default Warnings;
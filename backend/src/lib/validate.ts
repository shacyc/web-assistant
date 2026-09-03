/**
 * Kiểm input viết tay, không dùng zod.
 *
 * Lý do là trần 10ms CPU của Workers Free: zod tốn cả bundle lẫn thời gian dựng schema
 * lúc khởi động, đổi lấy thứ mà ~150 dòng dưới đây làm đủ cho vài endpoint. Khi số
 * endpoint tăng gấp mấy lần thì tính lại.
 *
 * ## Hai quy ước phải giữ
 *
 * - **Vắng mặt ≠ null.** Field không gửi trả `undefined`, và drizzle bỏ qua `undefined`
 *   trong `.set()` — đó chính là cách PATCH giữ nguyên giá trị cũ. "Chuẩn hoá"
 *   `undefined` thành `null` là biến mọi PATCH thành xoá trắng.
 * - **Dừng ở lỗi đầu tiên.** Gom hết lỗi rồi trả một lượt nghe hay hơn nhưng không ai
 *   dùng: client là app của chính mình, và nó không hiển thị danh sách lỗi.
 */

import { isValidDate, isValidHHMM } from './dates';

export interface FieldError {
    field: string;
    reason: string;
}

/**
 * Khi một field sai, mọi lần đọc SAU đó vẫn chạy nhưng không ghi đè lỗi đầu tiên, và
 * trả về giá trị rỗng hợp kiểu. Nhờ vậy call site viết thẳng một mạch rồi kiểm `.error`
 * đúng một lần, thay vì lồng sáu tầng `if`.
 */
export class Body {
    private firstError: FieldError | null = null;
    private readonly raw: Record<string, unknown>;

    constructor(body: unknown) {
        const isObject = typeof body === 'object' && body !== null && !Array.isArray(body);
        this.raw = isObject ? (body as Record<string, unknown>) : {};
        if (!isObject) this.fail('body', 'phải là một object JSON');
    }

    get error(): FieldError | null {
        return this.firstError;
    }

    private fail(field: string, reason: string): void {
        if (!this.firstError) this.firstError = { field, reason };
    }

    private present(name: string): boolean {
        const v = this.raw[name];
        return v !== undefined && v !== null;
    }

    /** Chuỗi bắt buộc, không rỗng sau khi trim. */
    requiredString(name: string, max: number): string {
        const v = this.raw[name];
        if (typeof v !== 'string') {
            this.fail(name, 'phải là chuỗi');
            return '';
        }
        const trimmed = v.trim();
        if (!trimmed) {
            this.fail(name, 'không được rỗng');
            return '';
        }
        if (trimmed.length > max) {
            this.fail(name, `dài quá ${max} ký tự`);
            return '';
        }
        return trimmed;
    }

    /**
     * Chuỗi bắt buộc CÓ MẶT nhưng cho phép rỗng. Dùng cho `value` của bảng variables:
     * "đặt key này thành chuỗi rỗng" là thao tác hợp lệ, khác hẳn "không gửi field".
     */
    presentString(name: string, max: number): string {
        const v = this.raw[name];
        if (typeof v !== 'string') {
            this.fail(name, 'phải là chuỗi');
            return '';
        }
        if (v.length > max) {
            this.fail(name, `dài quá ${max} ký tự`);
            return '';
        }
        return v;
    }

    /** Chuỗi tuỳ chọn. Gửi null tường minh = xoá; không gửi = giữ nguyên. */
    optionalString(name: string, max: number): string | null | undefined {
        if (this.raw[name] === undefined) return undefined;
        if (this.raw[name] === null) return null;
        const v = this.raw[name];
        if (typeof v !== 'string') {
            this.fail(name, 'phải là chuỗi');
            return undefined;
        }
        const trimmed = v.trim();
        if (trimmed.length > max) {
            this.fail(name, `dài quá ${max} ký tự`);
            return undefined;
        }
        return trimmed || null;
    }

    optionalBoolean(name: string): boolean | undefined {
        if (!this.present(name)) return undefined;
        const v = this.raw[name];
        if (typeof v !== 'boolean') {
            // Cố ý không ép kiểu: "true" bị từ chối chứ không thành true. Ép kiểu ngầm
            // là cách dữ liệu rác lọt vào DB mà không ai nhận ra.
            this.fail(name, 'phải là boolean');
            return undefined;
        }
        return v;
    }

    /** Ngày 'YYYY-MM-DD', bắt buộc và phải là ngày có thật. */
    requiredDate(name: string): string {
        const v = this.raw[name];
        if (typeof v !== 'string') {
            this.fail(name, 'phải là chuỗi ngày YYYY-MM-DD');
            return '';
        }
        if (!isValidDate(v)) {
            this.fail(name, 'phải là ngày có thật, định dạng YYYY-MM-DD');
            return '';
        }
        return v;
    }

    optionalDate(name: string): string | undefined {
        if (!this.present(name)) return undefined;
        const v = this.raw[name];
        if (typeof v !== 'string' || !isValidDate(v)) {
            this.fail(name, 'phải là ngày có thật, định dạng YYYY-MM-DD');
            return undefined;
        }
        return v;
    }

    /** Giờ trong ngày 'HH:MM' 24h, bắt buộc. */
    requiredTime(name: string): string {
        const v = this.raw[name];
        if (typeof v !== 'string' || !isValidHHMM(v)) {
            this.fail(name, 'phải là giờ HH:MM 24h');
            return '';
        }
        return v;
    }

    optionalTime(name: string): string | undefined {
        if (!this.present(name)) return undefined;
        const v = this.raw[name];
        if (typeof v !== 'string' || !isValidHHMM(v)) {
            this.fail(name, 'phải là giờ HH:MM 24h');
            return undefined;
        }
        return v;
    }

    /**
     * Object JSON tuỳ chọn, trả về chuỗi đã `JSON.stringify` để ghi thẳng vào cột TEXT.
     * Không gửi = `undefined` (giữ nguyên khi PATCH). Gửi thứ không phải object (mảng,
     * số, null) = lỗi: payload của một job phải là `{ field: value }`.
     */
    optionalJsonObjectString(name: string, max: number): string | undefined {
        if (this.raw[name] === undefined) return undefined;
        const v = this.raw[name];
        if (typeof v !== 'object' || v === null || Array.isArray(v)) {
            this.fail(name, 'phải là object JSON');
            return undefined;
        }
        const s = JSON.stringify(v);
        if (s.length > max) {
            this.fail(name, `dài quá ${max} ký tự`);
            return undefined;
        }
        return s;
    }

    /** Ghi một lỗi nghiệp vụ vào cùng cơ chế, để call site chỉ kiểm `.error` một lần. */
    reject(field: string, reason: string): void {
        this.fail(field, reason);
    }
}
